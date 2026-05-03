import { Cache } from "./cache";
import { computeGeneratedRevenue, TO_EUR } from "./attention";
import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { searchObjectsPage } from "./hubspot-search";
import { fetchOwnerNames } from "./onboarding";
import { computeWatchOutSignals } from "./signals";
import type {
  PortfolioResponse,
  PortfolioRow,
  PortfolioSignalKey,
  PortfolioSortKey,
  PortfolioStage,
  WatchOutSignal,
  WatchOutSignalKind,
} from "./types";

// Maps HubSpot `customer_stage` to our 5-stage Portfolio union. Unknown
// values fall back to "Established" so the account still appears in the
// portfolio rather than being silently dropped.
export function classifyPortfolioStage(
  customerStage: string,
  _customerSubstage: string | null
): PortfolioStage {
  switch (customerStage) {
    case "Onboarding":
      return "Onboarding";
    case "Adopted":
      return "Adopted";
    case "Started":
      return "Started";
    case "Ramp Up":
      return "Ramp Up";
    case "Established":
      return "Established";
    default:
      return "Established";
  }
}

// Which signals can fire for each stage. A signal is dropped from a row if
// the row's stage is not in its applicability set.
export const STAGE_APPLICABILITY: Record<PortfolioSignalKey, PortfolioStage[]> = {
  overdue_invoices:  ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  open_invoices:     ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  no_future_events:  ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  health_dropped:    ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  gone_quiet:        ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  wish_to_churn:     ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  stuck_in_step:     ["Onboarding", "Adopted", "Started"],
  volume_declining:  ["Ramp Up", "Established"],
};

export function isSignalApplicable(signal: PortfolioSignalKey, stage: PortfolioStage): boolean {
  return STAGE_APPLICABILITY[signal].includes(stage);
}

// Pure value extractor for a row + sort key. Returns null when the requested
// signal-specific value is unavailable for this row. CONTRACT for callers:
// non-firing rows must be ordered last regardless of sort direction so they
// never outrank firing ones. The Portfolio container's sort comparator
// (Task 11) is responsible for honoring this.
export function extractSortKey(row: PortfolioRow, key: PortfolioSortKey): number | string | null {
  switch (key) {
    // Universal
    case "urgency":         return row.signals.length * 10000 + row.revenue;
    case "name":            return row.name;
    case "revenue":         return row.revenue;
    case "health":          return row.healthScore;
    case "last_contact":    return row.daysSinceContact;
    case "days_in_stage":   return row.daysInStage;

    // Overdue invoices
    case "oldest_outstanding": return row.overdueDays;
    case "value_overdue":      return row.outstandingEur;
    case "count_overdue":      return row.openInvoiceCount;

    // Open invoices
    case "due_soonest":        return row.daysUntilDue;
    case "value_open":         return row.outstandingEur;
    case "count_open":         return row.openInvoiceCount;

    // No future events
    case "longest_silence_events": return row.daysSilent;
    case "revenue_no_events":      return row.revenue;

    // Health drop
    case "biggest_drop":        return row.healthDrop;
    case "current_score_asc":   return row.healthScore;

    // Stuck in step
    case "longest_stuck":       return row.daysInStage;
    case "days_past_expected":  return row.daysPastExpectedStep;

    // Volume declining
    case "biggest_pct_drop":    return row.volumeDropPct;
    case "prior_3m_volume":     return row.prior3mVolume;

    // Wish to churn
    case "wish_flagged_recent": return row.wishToChurnAt;

    // Gone quiet
    case "longest_silence_quiet": return row.daysSilent;
  }
}

export interface SortOption {
  key: PortfolioSortKey;
  label: string;
  /** Sort direction. "desc" puts higher values first. */
  direction: "asc" | "desc";
}

const UNIVERSAL_SORTS: SortOption[] = [
  { key: "urgency",       label: "Urgency",         direction: "desc" },
  { key: "name",          label: "Name (A-Z)",      direction: "asc"  },
  { key: "revenue",       label: "Revenue",         direction: "desc" },
  { key: "health",        label: "Health (worst first)", direction: "asc" },
  { key: "last_contact",  label: "Last contact (longest first)", direction: "desc" },
  { key: "days_in_stage", label: "Days in stage",   direction: "desc" },
];

const SIGNAL_SPECIFIC_SORTS: Record<PortfolioSignalKey, SortOption[]> = {
  overdue_invoices: [
    { key: "oldest_outstanding", label: "Oldest outstanding",  direction: "desc" },
    { key: "value_overdue",      label: "Value of overdue",    direction: "desc" },
    { key: "count_overdue",      label: "Number of invoices",  direction: "desc" },
  ],
  open_invoices: [
    { key: "due_soonest",  label: "Due soonest",  direction: "asc"  },
    { key: "value_open",   label: "Value",        direction: "desc" },
    { key: "count_open",   label: "Count",        direction: "desc" },
  ],
  no_future_events: [
    { key: "longest_silence_events", label: "Longest silence", direction: "desc" },
    { key: "revenue_no_events",      label: "Revenue",         direction: "desc" },
  ],
  health_dropped: [
    { key: "biggest_drop",      label: "Biggest drop",            direction: "desc" },
    { key: "current_score_asc", label: "Current score (worst first)", direction: "asc" },
  ],
  stuck_in_step: [
    { key: "longest_stuck",      label: "Longest stuck",        direction: "desc" },
    { key: "days_past_expected", label: "Days past expected",   direction: "desc" },
  ],
  volume_declining: [
    { key: "biggest_pct_drop", label: "Biggest % drop",   direction: "desc" },
    { key: "prior_3m_volume",  label: "Prior 3m volume",  direction: "desc" },
  ],
  wish_to_churn: [
    { key: "wish_flagged_recent", label: "Most recently flagged", direction: "desc" },
  ],
  gone_quiet: [
    { key: "longest_silence_quiet", label: "Longest silence", direction: "desc" },
  ],
};

// Returns the sort options to render in the dropdown given the active signal
// filter. With exactly one signal selected, the signal-specific sorts join
// the universals. With 0 or 2+ signals, only universals appear.
export function getSortOptions(selectedSignals: PortfolioSignalKey[]): SortOption[] {
  if (selectedSignals.length !== 1) return UNIVERSAL_SORTS;
  const specific = SIGNAL_SPECIFIC_SORTS[selectedSignals[0]] ?? [];
  return [...UNIVERSAL_SORTS, ...specific];
}

interface BuildRowInput {
  nowIso: string;
  company: {
    id: string;
    name: string;
    domain: string | null;
    ownerId: string | null;
    ownerName: string | null;
    healthScore: number | null;
    revenue: number;
    notesLastContacted: string | null;
    volume3m: number;
    volume6m: number;
    upcomingEvents: number | null;
  };
  deal: {
    customerStage: string;
    customerSubstage: string | null;
    enteredStageDate: string | null;
    customerLiveDate: string | null;
    unpaidInvoice: boolean;
    invoiceDueDate: string | null;
    outstandingEur: number | null;
    overdueDays: number | null;
    daysUntilDue: number | null;
    openInvoiceCount: number | null;
    wishToChurn: boolean;
    churnReason: string | null;
    wishToChurnAt: string | null;
    daysInStep: number | null;
    expectedDaysInStep: number | null;
  };
}

const SIGNAL_KIND_TO_KEY: Record<WatchOutSignalKind, PortfolioSignalKey> = {
  overdue_invoice: "overdue_invoices",
  wish_to_churn: "wish_to_churn",
  volume_declining: "volume_declining",
  health_dropped: "health_dropped",
  no_future_events: "no_future_events",
  gone_quiet: "gone_quiet",
  stuck_in_step: "stuck_in_step",
};

function daysBetween(now: string, then: string | null): number | null {
  if (!then) return null;
  const t = new Date(then).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((new Date(now).getTime() - t) / 86400000));
}

export function buildRow(input: BuildRowInput): PortfolioRow {
  const stage = classifyPortfolioStage(input.deal.customerStage, input.deal.customerSubstage);
  const daysSilent = daysBetween(input.nowIso, input.company.notesLastContacted);

  // Build the full watch-out list, then drop entries whose signal is not
  // applicable to this row's stage. open_invoices is not a WatchOutSignalKind
  // (it's a Portfolio-only concept); we synthesize it from the same data.
  const computed = computeWatchOutSignals({
    nowIso: input.nowIso,
    unpaidInvoice: input.deal.unpaidInvoice,
    invoiceDueDate: input.deal.invoiceDueDate,
    outstandingEur: input.deal.outstandingEur,
    overdueDays: input.deal.overdueDays,
    wishToChurn: input.deal.wishToChurn,
    churnReason: input.deal.churnReason,
    volume3m: input.company.volume3m,
    volume6m: input.company.volume6m,
    healthScore: input.company.healthScore,
    upcomingEvents: input.company.upcomingEvents,
    notesLastContacted: input.company.notesLastContacted,
    daysInStep: input.deal.daysInStep,
    expectedDaysInStep: input.deal.expectedDaysInStep,
  });

  const applicable: WatchOutSignal[] = computed.filter((s) =>
    isSignalApplicable(SIGNAL_KIND_TO_KEY[s.kind], stage)
  );

  // open_invoices: synthesized when there is an open invoice that is not
  // already overdue (overdue is covered by the overdue_invoice WatchOut).
  const hasOpenNonOverdue =
    (input.deal.openInvoiceCount ?? 0) > 0 &&
    !applicable.some((s) => s.kind === "overdue_invoice");
  if (hasOpenNonOverdue && isSignalApplicable("open_invoices", stage)) {
    applicable.push({
      kind: "overdue_invoice", // reuse the kind union; severity + title differentiate
      severity: "warn",
      title: "Open invoice",
      detail: `${input.deal.openInvoiceCount} open invoice${input.deal.openInvoiceCount === 1 ? "" : "s"}`,
    });
  }

  const volumeDropPct =
    input.company.volume6m > 0 &&
    input.company.volume3m < (input.company.volume6m - input.company.volume3m) * 0.5
      ? 1 - input.company.volume3m / Math.max(1, input.company.volume6m - input.company.volume3m)
      : null;

  const healthDrop =
    input.company.healthScore != null && input.company.healthScore < 60
      ? 60 - input.company.healthScore
      : null;

  const daysPastExpectedStep =
    input.deal.daysInStep != null &&
    input.deal.expectedDaysInStep != null &&
    input.deal.daysInStep > input.deal.expectedDaysInStep
      ? input.deal.daysInStep - input.deal.expectedDaysInStep
      : null;

  return {
    id: input.company.id,
    name: input.company.name,
    domain: input.company.domain,
    ownerId: input.company.ownerId,
    ownerName: input.company.ownerName,
    stage,
    daysInStage: daysBetween(input.nowIso, input.deal.enteredStageDate),
    customerLiveDate: input.deal.customerLiveDate,
    revenue: input.company.revenue,
    healthScore: input.company.healthScore,
    daysSinceContact: daysSilent,
    signals: applicable,
    overdueDays: input.deal.overdueDays,
    daysUntilDue: input.deal.daysUntilDue,
    outstandingEur: input.deal.outstandingEur,
    openInvoiceCount: input.deal.openInvoiceCount,
    daysSilent,
    healthDrop,
    daysPastExpectedStep,
    volumeDropPct,
    prior3mVolume: Math.max(0, input.company.volume6m - input.company.volume3m) || null,
    wishToChurnAt: input.deal.wishToChurnAt,
  };
}

// Cache + payload orchestrator. Imported by `/api/portfolio/route.ts` and
// the Server-Component initial-data fetch in `src/app/page.tsx`. Sharing the
// module instance lets a server-render and a subsequent client refetch hit
// the same in-memory cache.
const portfolioCache = new Cache<PortfolioResponse>(15 * 60 * 1000);

export function getCachedPortfolio(key: string): PortfolioResponse | null {
  return portfolioCache.get(key);
}

export async function buildPortfolioPayload(
  ownerIdsCsv: string | null,
  options: { refresh?: boolean } = {}
): Promise<PortfolioResponse> {
  const cacheKey = `portfolio:${ownerIdsCsv ?? "all"}`;
  if (!options.refresh) {
    const cached = portfolioCache.get(cacheKey);
    if (cached) return cached;
  }
  return portfolioCache.getOrBuild(cacheKey, async () => {
    const rows = await fetchPortfolioRows(ownerIdsCsv);
    return aggregatePayload(rows);
  });
}

// Pipelines that source the Portfolio universe. Lifecycle (166333631) covers
// onboarding-stage customers; Retention (1072518362) covers Adopted/Started/
// Ramp Up/Established. We union both pipelines and skip Churned client-side.
const LIFECYCLE_PIPELINE_ID = "166333631";
const RETENTION_PIPELINE_ID = "1072518362";

const PORTFOLIO_DEAL_PROPS = [
  "customer_stage",
  "customer_substage",
  "customer_live_date",
  "hs_v2_date_entered_current_stage",
  "unpaid_invoice",
  "invoice_due_date",
  "outstanding_amount",
  "number_of_open_invoices",
  "wish_to_churn",
  "churn_reason",
  "dealstage",
  "pipeline",
  "confirmed__contract_mrr",
  "deal_currency_code",
  "booking_fee",
  "confirmed_booking_fee",
  "hs_lastmodifieddate",
  "amount_in_home_currency",
];

const PORTFOLIO_COMPANY_PROPS = [
  "name",
  "domain",
  "hubspot_owner_id",
  "health_score",
  "understory_booking_volume_12m",
  "understory_booking_volume_3m",
  "understory_booking_volume_6m",
  "understory_health_score_upcoming_events",
  "notes_last_contacted",
  "createdate",
];

// Lifecycle-pipeline expected step durations. Mirrors the live `EXPECTED_DAYS`
// table in `./onboarding`; inlined here so we don't depend on the lifecycle-
// step classifier (Portfolio uses customer_stage directly).
const PORTFOLIO_EXPECTED_DAYS: Record<string, number> = {
  Adopted: 14,
  Started: 30,
  Hibernation: 30,
  "Product Hold": 14,
  Onboarding: 14,
};

interface RawDeal {
  id: string;
  properties: Record<string, string>;
}

// Paged search across one pipeline. Mirrors the canonical retry-aware helper
// in `pay-migration.ts`. Always passes a `sorts` clause (HubSpot search
// pagination silently truncates without one) and delegates to
// `searchObjectsPage` for the 429/5xx retry loop.
async function fetchPortfolioDealsForPipeline(pipelineId: string): Promise<RawDeal[]> {
  const out: RawDeal[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [
          { propertyName: "pipeline", operator: "EQ", value: pipelineId },
        ],
      }],
      properties: PORTFOLIO_DEAL_PROPS,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;
    const { results, nextAfter } = await searchObjectsPage<RawDeal>("deals", body);
    out.push(...results);
    after = nextAfter;
  } while (after);
  return out;
}

// Universe fetcher. Returns one PortfolioRow per (deal, company) pair across
// both pipelines, after applying the Churned-stage filter and the optional
// owner filter. Mirrors `fetchNoFutureEvents` step-by-step but without the
// upcoming-events filter, since Portfolio shows the whole universe.
export async function fetchPortfolioRows(ownerIdsCsv: string | null): Promise<PortfolioRow[]> {
  // Step 2a: search both pipelines in parallel.
  const [lifecycleDeals, retentionDeals] = await Promise.all([
    fetchPortfolioDealsForPipeline(LIFECYCLE_PIPELINE_ID),
    fetchPortfolioDealsForPipeline(RETENTION_PIPELINE_ID),
  ]);
  const allDeals = [...lifecycleDeals, ...retentionDeals]
    .filter((d) => d.properties.customer_stage !== "Churned");
  if (allDeals.length === 0) return [];

  // Step 2b: deal -> company associations via v4 batch (parallel).
  const dealToCompany = new Map<string, string>();
  const assocBatches: Promise<void>[] = [];
  for (let i = 0; i < allDeals.length; i += 100) {
    const slice = allDeals.slice(i, i + 100);
    assocBatches.push((async () => {
      try {
        const res = await fetch(
          `${HUBSPOT_API}/crm/v4/associations/deals/companies/batch/read`,
          {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({ inputs: slice.map((d) => ({ id: d.id })) }),
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const result of data.results || []) {
          const dealId = String(result.from?.id ?? "");
          const firstCompany = result.to?.[0]?.toObjectId;
          if (dealId && firstCompany && !dealToCompany.has(dealId)) {
            dealToCompany.set(dealId, String(firstCompany));
          }
        }
      } catch { /* skip this batch; individual rows just won't appear */ }
    })());
  }
  await Promise.all(assocBatches);
  if (dealToCompany.size === 0) return [];

  const uniqueCompanyIds = Array.from(new Set(dealToCompany.values()));

  // Step 2c: company properties via v3 batch (parallel).
  const companyProps = new Map<string, Record<string, string>>();
  const companyBatches: Promise<void>[] = [];
  for (let i = 0; i < uniqueCompanyIds.length; i += 100) {
    const slice = uniqueCompanyIds.slice(i, i + 100);
    companyBatches.push((async () => {
      try {
        const res = await fetch(
          `${HUBSPOT_API}/crm/v3/objects/companies/batch/read`,
          {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({
              inputs: slice.map((id) => ({ id })),
              properties: PORTFOLIO_COMPANY_PROPS,
            }),
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const c of data.results || []) {
          companyProps.set(String(c.id), c.properties || {});
        }
      } catch { /* skip; missing companies just won't appear */ }
    })());
  }
  await Promise.all(companyBatches);

  // Step 2d: owner filter. `null` and "all" both mean unfiltered.
  const ownerFilter = ownerIdsCsv && ownerIdsCsv !== "all"
    ? new Set(ownerIdsCsv.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  // Step 2e: owner directory (request-level cached).
  const ownerNames = await fetchOwnerNames(
    Array.from(new Set(
      Array.from(companyProps.values())
        .map((p) => p.hubspot_owner_id)
        .filter((id): id is string => Boolean(id))
    ))
  );

  // Step 2f: assemble rows.
  const nowIso = new Date().toISOString();
  const todayMs = Date.parse(nowIso.split("T")[0]);
  const rows: PortfolioRow[] = [];

  for (const deal of allDeals) {
    const companyId = dealToCompany.get(deal.id);
    if (!companyId) continue;
    const props = companyProps.get(companyId);
    if (!props) continue;

    const ownerId = props.hubspot_owner_id || null;
    if (ownerFilter && (!ownerId || !ownerFilter.has(ownerId))) continue;

    const dealProps = deal.properties;

    // Revenue via the shared computation (booking-fee revenue + MRR * tenure).
    const revenue = computeGeneratedRevenue(
      props.understory_booking_volume_12m,
      dealProps.booking_fee || dealProps.confirmed_booking_fee,
      dealProps.confirmed__contract_mrr,
      dealProps.deal_currency_code,
      props.createdate
    );

    const healthScoreRaw = parseFloat(props.health_score || "");
    const healthScore = isNaN(healthScoreRaw) ? null : healthScoreRaw;

    const upcomingRaw = parseFloat(props.understory_health_score_upcoming_events || "");
    const upcomingEvents = isNaN(upcomingRaw) ? null : upcomingRaw;

    const unpaidInvoice = dealProps.unpaid_invoice === "true";
    const invoiceDueDate = dealProps.invoice_due_date || null;

    const outstandingNum = parseFloat(dealProps.outstanding_amount || "");
    const rate = TO_EUR[(dealProps.deal_currency_code || "EUR").toUpperCase()] ?? 1;
    const outstandingEur = !isNaN(outstandingNum) && outstandingNum > 0
      ? Math.round(outstandingNum * rate)
      : null;

    // Overdue / due-soon split. Both are computed here (not in buildRow) so
    // the caller owns date arithmetic. See PortfolioRow JSDoc.
    let overdueDays: number | null = null;
    let daysUntilDue: number | null = null;
    if (unpaidInvoice && invoiceDueDate) {
      const dueMs = Date.parse(invoiceDueDate);
      if (!isNaN(dueMs)) {
        if (dueMs < todayMs) {
          overdueDays = Math.floor((todayMs - dueMs) / 86400000);
        } else if (dueMs > todayMs) {
          daysUntilDue = Math.floor((dueMs - todayMs) / 86400000);
        }
      }
    }

    const openInvoiceCountRaw = parseInt(dealProps.number_of_open_invoices || "");
    const openInvoiceCount = !isNaN(openInvoiceCountRaw) && openInvoiceCountRaw > 0
      ? openInvoiceCountRaw
      : null;

    const wishToChurn = dealProps.wish_to_churn === "true";
    const churnReason = dealProps.churn_reason || null;
    // Coarse proxy: when wish_to_churn is true, the most recent deal mod is
    // usually the toggle event. Good enough for "most recently flagged".
    const wishToChurnAt = wishToChurn
      ? dealProps.hs_lastmodifieddate || null
      : null;

    // Days-in-step is only meaningful in the lifecycle pipeline. Retention
    // deals don't have a stuck_in_step concept.
    let daysInStep: number | null = null;
    let expectedDaysInStep: number | null = null;
    if (dealProps.pipeline === LIFECYCLE_PIPELINE_ID) {
      const enteredAt = dealProps.hs_v2_date_entered_current_stage;
      if (enteredAt) {
        const enteredMs = Date.parse(enteredAt);
        if (!isNaN(enteredMs)) {
          daysInStep = Math.max(0, Math.floor((Date.now() - enteredMs) / 86400000));
        }
      }
      const stage = dealProps.customer_stage || "";
      expectedDaysInStep = PORTFOLIO_EXPECTED_DAYS[stage] ?? null;
    }

    const volume3m = parseFloat(props.understory_booking_volume_3m || "0") || 0;
    const volume6m = parseFloat(props.understory_booking_volume_6m || "0") || 0;

    rows.push(buildRow({
      nowIso,
      company: {
        id: companyId,
        name: props.name || "Unknown",
        domain: props.domain || null,
        ownerId,
        ownerName: ownerId ? ownerNames[ownerId] || null : null,
        healthScore,
        revenue,
        notesLastContacted: props.notes_last_contacted || null,
        volume3m,
        volume6m,
        upcomingEvents,
      },
      deal: {
        customerStage: dealProps.customer_stage || "",
        customerSubstage: dealProps.customer_substage || null,
        enteredStageDate: dealProps.hs_v2_date_entered_current_stage || null,
        customerLiveDate: dealProps.customer_live_date || null,
        unpaidInvoice,
        invoiceDueDate,
        outstandingEur,
        overdueDays,
        daysUntilDue,
        openInvoiceCount,
        wishToChurn,
        churnReason,
        wishToChurnAt,
        daysInStep,
        expectedDaysInStep,
      },
    }));
  }

  return rows;
}

function aggregatePayload(rows: PortfolioRow[]): PortfolioResponse {
  const totalsByStage: Record<PortfolioStage, number> = {
    Onboarding: 0, Adopted: 0, Started: 0, "Ramp Up": 0, Established: 0,
  };
  const totalsBySignal: Record<PortfolioSignalKey, number> = {
    overdue_invoices: 0, open_invoices: 0, no_future_events: 0, health_dropped: 0,
    stuck_in_step: 0, volume_declining: 0, wish_to_churn: 0, gone_quiet: 0,
  };

  for (const r of rows) {
    totalsByStage[r.stage] += 1;
    for (const s of r.signals) {
      const key = SIGNAL_KIND_TO_KEY[s.kind];
      // open_invoices is synthesized in buildRow with kind "overdue_invoice"
      // but title "Open invoice". Discriminate by title here so the count
      // is split correctly without extending WatchOutSignalKind.
      if (s.title === "Open invoice") {
        totalsBySignal.open_invoices += 1;
      } else {
        totalsBySignal[key] += 1;
      }
    }
  }

  return {
    rows,
    generatedAt: new Date().toISOString(),
    totalsByStage,
    totalsBySignal,
  };
}

// Test-only re-export.
export const __test = { aggregatePayload };
