import { Cache } from "./cache";
import { TO_EUR } from "./attention";
import { dealCurrency, hasUnpaidInvoice, unpaidAmountLocal, unpaidInvoiceCount } from "./invoice-fields";
import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { searchObjectsPage } from "./hubspot-search";
import { fetchOwnerNames } from "./onboarding";
import {
  computeWatchOutSignals,
  STAGE_APPLICABILITY as SHARED_STAGE_APPLICABILITY,
  isSignalApplicable as sharedIsSignalApplicable,
} from "./signals";
import type {
  PortfolioResponse,
  PortfolioRow,
  PortfolioSignalKey,
  PortfolioSortKey,
  PortfolioStage,
  WatchOutSignal,
  WatchOutSignalKind,
} from "./types";

// Pipelines that source the Portfolio universe. Lifecycle (166333631) covers
// onboarding-stage customers; Retention (1072518362) covers Adopted/Started/
// Ramp Up/Established. We union both pipelines and skip Churned client-side.
// Hoisted here so `classifyPortfolioStage` can use Lifecycle as the empty-
// stage fallback signal.
const LIFECYCLE_PIPELINE_ID = "166333631";
const RETENTION_PIPELINE_ID = "1072518362";

// Maps a deal to one of the 5 Portfolio stages.
//
// The two pipelines have different stage semantics:
//   - Lifecycle (the onboarding pipeline) is always "Onboarding" at the
//     Portfolio level. Its `customer_stage` values (Book meeting / Create
//     account / Create experience / Awaiting meeting / In progress) are
//     onboarding sub-steps that we don't surface in the row chip.
//   - Retention deals carry the post-onboarding progression in
//     `customer_stage`: Adopted → Started → Ramp Up → Established.
//
// `Hibernation` and `Product Hold` are overlay states, not stages: a deal
// can be Adopted-and-hibernating or In-progress-and-on-hold. When the
// overlay shows up in `customer_stage`, the underlying stage is sometimes
// preserved in `customer_substage`; we look there first, then fall back to
// the pipeline's entry stage (Onboarding / Adopted) so the row never
// misclassifies as Established just because a deal is on hold.
export function classifyPortfolioStage(
  customerStage: string,
  pipelineId: string,
  customerSubstage: string | null = null
): PortfolioStage {
  // customer_stage is the canonical taxonomy. When it's set to a known
  // stage, trust it regardless of pipeline — a Lifecycle-pipeline deal with
  // customer_stage="Started" is genuinely past the early-onboarding phase
  // and should not be lumped under "Onboarding" just because HubSpot hasn't
  // moved it across pipelines yet. (Pre-2026-05 we hard-coded Lifecycle →
  // Onboarding; that hid Started/Adopted/Ramp-Up deals from those filters.)
  //
  // HubSpot's customer_stage enum returns internal *values* that don't match
  // the *labels* shown in the HubSpot UI. The mapping is asymmetric:
  //   internal value  →  UI label  →  Portfolio bucket
  //   "Onboarding"       Onboarding    Onboarding
  //   "Adoption"         Adopted       Adopted
  //   "Live"             Started       Started
  //   "Ramp Up"          Ramp Up       Ramp Up
  //   "Established"      Established   Established
  // The trim/lowercase/whitespace normalization absorbs minor data hygiene
  // issues without losing this label↔value mapping. Verified against the
  // HubSpot property definition on 2026-05-06.
  const norm = (customerStage || "").trim().toLowerCase().replace(/[\s-_]+/g, " ");
  switch (norm) {
    case "onboarding": return "Onboarding";
    case "adoption": return "Adopted";
    case "adopted":   return "Adopted";
    case "live":      return "Started";
    case "started":   return "Started";
    case "ramp up":   return "Ramp Up";
    case "established": return "Established";
  }

  // Overlay states. Try to recover the underlying stage from substage; if
  // we can't, fall back conservatively (account stays visible to CS).
  if (norm === "hibernation" || norm === "product hold") {
    const substageLower = (customerSubstage ?? "").toLowerCase();
    if (substageLower.includes("established")) return "Established";
    if (substageLower.includes("ramp")) return "Ramp Up";
    if (substageLower.includes("started")) return "Started";
    if (substageLower.includes("adopted")) return "Adopted";
    return pipelineId === LIFECYCLE_PIPELINE_ID ? "Onboarding" : "Adopted";
  }

  // Empty / unrecognised customer_stage. Pipeline gives us a fallback —
  // Lifecycle starts at Onboarding, Retention starts at Adopted.
  if (pipelineId === LIFECYCLE_PIPELINE_ID) return "Onboarding";
  return "Adopted";
}

// Stage applicability now lives in signals.ts so every consumer of
// computeWatchOutSignals sees the same gating. Re-exported here for
// back-compat with callers that already import from this module.
export const STAGE_APPLICABILITY = SHARED_STAGE_APPLICABILITY;
export const isSignalApplicable = sharedIsSignalApplicable;

// Pure value extractor for a row + sort key. Returns null when the requested
// signal-specific value is unavailable for this row. CONTRACT for callers:
// non-firing rows must be ordered last regardless of sort direction so they
// never outrank firing ones. The Portfolio container's sort comparator
// (Task 11) is responsible for honoring this.
// Numeric ordering for the 5 portfolio stages so "stage" can be a sort key.
// asc puts Onboarding first; desc puts Established first.
const STAGE_ORDER: Record<PortfolioRow["stage"], number> = {
  Onboarding: 0,
  Adopted: 1,
  Started: 2,
  "Ramp Up": 3,
  Established: 4,
};

// Map a row's signal kind+title pair to its canonical PortfolioSignalKey.
// "Open invoice" is a special-case title that overrides the kind because the
// upstream `overdue_invoice` kind is reused for both due-but-unpaid and
// overdue invoices. Centralized here so the container, view, and any future
// caller all bucket signals identically.
export function mapKindToKey(kind: string, title: string): PortfolioSignalKey {
  if (title === "Open invoice") return "open_invoices";
  switch (kind) {
    case "overdue_invoice":   return "overdue_invoices";
    case "wish_to_churn":     return "wish_to_churn";
    case "volume_declining":  return "volume_declining";
    case "no_future_events":  return "no_future_events";
    case "stuck_in_step":     return "stuck_in_step";
    case "health_dropped":    return "health_dropped";
    case "gone_quiet":        return "gone_quiet";
    case "not_on_pay":        return "not_on_pay";
    default:                  return "gone_quiet";
  }
}

export function extractSortKey(row: PortfolioRow, key: PortfolioSortKey): number | string | null {
  switch (key) {
    // Universal
    case "urgency": {
      // Severity-weighted: bad counts 3x, warn counts 1x. Multiplier keeps
      // signal weight dominant over ACV; ACV is the within-tier tie-breaker.
      const weight = row.signals.reduce(
        (s, sig) => s + (sig.severity === "bad" ? 3 : 1),
        0
      );
      return weight * 10000 + row.revenue;
    }
    case "name":            return row.name;
    case "stage":           return STAGE_ORDER[row.stage];
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
  { key: "urgency",       label: "Urgency",        direction: "desc" },
  { key: "stage",         label: "Stage",          direction: "asc"  },
  { key: "name",          label: "Name",           direction: "asc"  },
  { key: "revenue",       label: "ACV",            direction: "desc" },
  { key: "health",        label: "Health",         direction: "asc"  },
  { key: "last_contact",  label: "Last contact",   direction: "desc" },
  { key: "days_in_stage", label: "Days in stage",  direction: "desc" },
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
    { key: "revenue_no_events",      label: "ACV",             direction: "desc" },
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
  not_on_pay: [],
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
    pipelineId: string;
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
    payStatus: string | null;
    estimatedAdoptionDate: string | null;
    hibernationStart: string | null;
    hibernationEnd: string | null;
    productHoldStart: string | null;
    productHoldEnd: string | null;
    pauseStart: string | null;
    pauseEnd: string | null;
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
  not_on_pay: "not_on_pay",
};

function isWithin(nowIso: string, start: string | null, end: string | null): boolean {
  if (!start) return false;
  const now = new Date(nowIso).getTime();
  const s = new Date(start).getTime();
  if (isNaN(s) || now < s) return false;
  if (!end) return true;
  const e = new Date(end).getTime();
  if (isNaN(e)) return true;
  return now <= e;
}

function computeDealStatus(
  nowIso: string,
  deal: BuildRowInput["deal"]
): PortfolioRow["dealStatus"] {
  if (isWithin(nowIso, deal.hibernationStart, deal.hibernationEnd)) return "hibernation";
  if (isWithin(nowIso, deal.productHoldStart, deal.productHoldEnd)) return "product_hold";
  if (isWithin(nowIso, deal.pauseStart, deal.pauseEnd)) return "paused";
  return null;
}

// HubSpot DATE properties can come through the search API as either an
// ISO yyyy-mm-dd string or a millisecond-since-epoch numeric string,
// depending on how the property was indexed. Normalize to yyyy-mm-dd so
// downstream string comparisons (Refine adoption-date range filter) are
// honest. Returns null when the input doesn't parse.
function toIsoDateOnly(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const n = Number(trimmed);
  if (Number.isFinite(n) && n > 0) {
    const d = new Date(n);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
  }
  return null;
}

function daysBetween(now: string, then: string | null): number | null {
  if (!then) return null;
  const t = new Date(then).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((new Date(now).getTime() - t) / 86400000));
}

export function buildRow(input: BuildRowInput): PortfolioRow {
  const stage = classifyPortfolioStage(
    input.deal.customerStage,
    input.deal.pipelineId,
    input.deal.customerSubstage
  );
  const daysSilent = daysBetween(input.nowIso, input.company.notesLastContacted);

  // Stage-aware compute: signals not applicable for `stage` are dropped by
  // computeWatchOutSignals itself, so we no longer post-filter here.
  // open_invoices is not a WatchOutSignalKind (it's a Portfolio-only concept)
  // and is synthesized below from the same data.
  const applicable: WatchOutSignal[] = computeWatchOutSignals({
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
    payStatus: input.deal.payStatus,
    stage,
  });

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

  const dealStatus = computeDealStatus(input.nowIso, input.deal);

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
    dealStatus,
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
    estimatedAdoptionDate: input.deal.estimatedAdoptionDate,
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

const PORTFOLIO_DEAL_PROPS = [
  "customer_stage",
  "customer_substage",
  "customer_live_date",
  "hs_v2_date_entered_current_stage",
  "understory_earliest_unpaid_invoice_created_date",
  "understory_earliest_unpaid_invoice_due_date",
  "understory_number_of_unpaid_invoices",
  "understory_unpaid_amount_local_currency",
  "payment_method",
  "wish_to_churn",
  "churn_reason",
  "churn_date",
  "dealstage",
  "pipeline",
  // Owner of the *deal* (the CSM working the account), not the company. The
  // company-level hubspot_owner_id is typically the AE; using deal owner
  // matches the peer onboarding flow (`onboarding.ts:466`) and gives the
  // person filter accurate results for CS work.
  "hubspot_owner_id",
  // Calculated property: HubSpot sets this to "true" when the deal is in a
  // closed stage (won/lost). We filter closed deals out so the Portfolio only
  // surfaces deals that are still actionable.
  "hs_is_closed",
  "confirmed__contract_mrr",
  "currency",
  "booking_fee",
  "confirmed_booking_fee",
  "hs_lastmodifieddate",
  "amount_in_home_currency",
  "understory_pay_status__customer",
  // HubSpot internal name is `deal_live_date`; the property's label in
  // HubSpot is "Estimated Adoption Date" (don't get tripped up by the
  // mismatch — they're the same field).
  "deal_live_date",
  // Deal-state windows. When today falls inside the [start, end] range we
  // surface a secondary status tag and (by default) hide the row from
  // Portfolio. Property names are best-guess snake_case from the labels;
  // adjust here if HubSpot uses a different internal name.
  "hibernation_start_date",
  "hibernation_end_date",
  "product_hold_start_date",
  "product_hold_expected_end_date",
  "pause_start_date",
  "pause_end_date",
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
  // Drop deals that aren't actionable today:
  //   1. customer_stage === "Churned" (the canonical case)
  //   2. churn_date is set (HubSpot lets customer_stage freeze at pre-churn
  //      values like "Hibernation" when a churn_date is filled in, so the
  //      stage check alone misses these). Any non-empty churn_date counts.
  //   3. hs_is_closed === "true" — closed-won or closed-lost deals that no
  //      longer represent the company's current CS state. Without this
  //      filter, an old closed Retention deal can win out over an active
  //      Lifecycle deal under a person filter (since each deal becomes a row
  //      and the closed deal happens to be owned by the filtered person).
  const allDeals = [...lifecycleDeals, ...retentionDeals].filter((d) => {
    const stage = d.properties.customer_stage;
    const churnDate = d.properties.churn_date;
    if (stage === "Churned") return false;
    if (churnDate && churnDate.trim() !== "") return false;
    if (d.properties.hs_is_closed === "true") return false;
    return true;
  });
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

  // Step 2e: owner directory (request-level cached). fetchOwnerNames returns
  // the full directory regardless of input, so passing the deal-owner ids
  // alongside company-owner ids is purely belt-and-braces.
  const ownerNames = await fetchOwnerNames(
    Array.from(new Set([
      ...Array.from(companyProps.values()).map((p) => p.hubspot_owner_id),
      ...allDeals.map((d) => d.properties.hubspot_owner_id),
    ].filter((id): id is string => Boolean(id))))
  );

  // Step 2f: assemble rows.
  const nowIso = new Date().toISOString();
  const todayMs = Date.parse(nowIso.split("T")[0]);
  const rows: PortfolioRow[] = [];

  for (const deal of allDeals) {
    const dealProps = deal.properties;

    // Owner attribution: use the *deal* owner (CSM working the account), not
    // the company owner (typically the AE). Mirrors the peer onboarding flow
    // and produces accurate person-filter results for CS work.
    const ownerId = dealProps.hubspot_owner_id || null;
    if (ownerFilter && (!ownerId || !ownerFilter.has(ownerId))) continue;

    const companyId = dealToCompany.get(deal.id);
    if (!companyId) continue;
    const props = companyProps.get(companyId);
    if (!props) continue;

    // ACV = HubSpot's "Amount in company currency" on the lifecycle deal,
    // which is already the portal's home currency (EUR for Understory). No
    // FX conversion — show as-is. The legacy revenue helper (booking-fee +
    // MRR * tenure) is intentionally no longer called.
    const acvNum = parseFloat(dealProps.amount_in_home_currency || "");
    const revenue = !isNaN(acvNum) && acvNum > 0 ? Math.round(acvNum) : 0;

    const healthScoreRaw = parseFloat(props.health_score || "");
    const healthScore = isNaN(healthScoreRaw) ? null : healthScoreRaw;

    const upcomingRaw = parseFloat(props.understory_health_score_upcoming_events || "");
    const upcomingEvents = isNaN(upcomingRaw) ? null : upcomingRaw;

    const unpaidInvoice = hasUnpaidInvoice(dealProps);
    const invoiceDueDate = dealProps.understory_earliest_unpaid_invoice_due_date || null;

    const outstandingNum = unpaidAmountLocal(dealProps);
    const rate = TO_EUR[dealCurrency(dealProps)] ?? 1;
    const outstandingEur = outstandingNum > 0
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

    const openInvoiceCountRaw = unpaidInvoiceCount(dealProps);
    const openInvoiceCount = openInvoiceCountRaw > 0
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
        pipelineId: dealProps.pipeline || "",
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
        payStatus: dealProps.understory_pay_status__customer || null,
        estimatedAdoptionDate: toIsoDateOnly(dealProps.deal_live_date),
        hibernationStart: dealProps.hibernation_start_date || null,
        hibernationEnd: dealProps.hibernation_end_date || null,
        productHoldStart: dealProps.product_hold_start_date || null,
        productHoldEnd: dealProps.product_hold_expected_end_date || null,
        pauseStart: dealProps.pause_start_date || null,
        pauseEnd: dealProps.pause_end_date || null,
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
    not_on_pay: 0,
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
