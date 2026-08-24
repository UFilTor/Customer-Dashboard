import { Cache } from "./cache";
import { TO_EUR } from "./fx";
import { PORTFOLIO_EXPECTED_DAYS } from "@/config/thresholds";
import { dealCurrency, hasUnpaidInvoice, unpaidAmountLocal, unpaidInvoiceCount } from "./invoice-fields";
import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { searchObjectsPage } from "./hubspot-search";
import { fetchAssociations, fetchMeetingStartsForDeals, fetchObjectsBatch, fetchOwnerNames, isOnboardingMeeting } from "./onboarding";
import { OWNERS } from "./owners";
import { KANBAN_COLUMNS } from "./portfolio-kanban";
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

// Lifecycle dealstage ids for the "awaiting first OB meeting" columns: Create
// account, Create Experience, Awaiting meeting. Only deals sitting in one of
// these columns need the OB meeting-start lookup.
const OB_MEETING_STAGE_IDS = new Set(["1571910876", "1899766980", "875045332"]);

// The dealstage ids the kanban board maps directly to a column, derived from
// KANBAN_COLUMNS (portfolio-kanban.ts) so the two never drift apart. Any
// lifecycle deal whose dealstage falls outside this set (null, or an id
// HubSpot added after KANBAN_COLUMNS was written) falls back to the board's
// "Create account" column, so it needs the OB meeting-start lookup too even
// though it isn't in OB_MEETING_STAGE_IDS.
const MAPPED_BOARD_DEALSTAGE_IDS = new Set(KANBAN_COLUMNS.map((c) => c.dealstageId));

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
// Retention-pipeline board columns that map directly to a Portfolio stage.
// Stage IDs are portal-specific, same as RETENTION_PIPELINE_ID above.
// ("Churned" deliberately absent — churned deals are skipped client-side.)
const RETENTION_STAGE_BY_DEALSTAGE_ID: Record<string, PortfolioStage> = {
  "3460322544": "Ramp Up",
  "1486762226": "Established",
};

export function classifyPortfolioStage(
  customerStage: string,
  pipelineId: string,
  customerSubstage: string | null = null,
  dealstageId: string | null = null
): PortfolioStage {
  const fromProperty = classifyFromCustomerStage(customerStage, pipelineId, customerSubstage);

  // The customer_stage property can lag behind the pipeline column: a 2026-08
  // sweep found 22 retention deals sitting in the "Ramp Up" column with
  // customer_stage still "Live" (= Started). CS treats the board column as
  // truth, so for retention deals the column acts as a floor — it can only
  // promote the stage, never demote it (customer_stage stays the finer-
  // grained source when it's further along).
  if (pipelineId === RETENTION_PIPELINE_ID && dealstageId) {
    const fromColumn = RETENTION_STAGE_BY_DEALSTAGE_ID[dealstageId];
    if (fromColumn && STAGE_ORDER[fromColumn] > STAGE_ORDER[fromProperty]) {
      return fromColumn;
    }
  }
  return fromProperty;
}

function classifyFromCustomerStage(
  customerStage: string,
  pipelineId: string,
  customerSubstage: string | null
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
  /**
   * Primary contact email for the "Copy email" card action. Resolved in bulk
   * by fetchContactEmailsForDeals, keyed by deal id (not company/deal shaped
   * since it's a contact-entity concern, not a property of either).
   */
  contactEmail: string | null;
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
    experiencesCreated: number | null;
    hasHadEvent: boolean | null;
    latestEventAt: string | null;
  };
  deal: {
    /** Backing HubSpot deal id. Threaded onto the row for hubspotDealUrl deep links. */
    dealId: string;
    customerStage: string;
    customerSubstage: string | null;
    pipelineId: string;
    /** HubSpot pipeline-stage id — lets the retention board column floor the stage. */
    dealstageId?: string | null;
    enteredStageDate: string | null;
    customerLiveDate: string | null;
    nextStep: string | null;
    /** Onboarding meeting start time ISO; populated by a later task, thread as null for now. */
    obMeetingAt: string | null;
    /** Raw ISO from hs_next_meeting_start_time. */
    nextMeetingAt: string | null;
    /** Raw ISO from notes_next_activity_date; parsed by the caller. */
    nextActivityAt: string | null;
    /** Mapped label from hs_notes_next_activity; parsed by the caller via nextActivityTypeLabel. */
    nextActivityType: string | null;
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

// Partial: note-signal kinds (churn_risk_mentioned, ...) are LLM-extracted
// per-company on the detail/meeting-prep surfaces and never flow through the
// bulk portfolio payload, so they have no PortfolioSignalKey.
const SIGNAL_KIND_TO_KEY: Partial<Record<WatchOutSignalKind, PortfolioSignalKey>> = {
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

// Picks the OB meeting date to surface on a row: the soonest upcoming
// onboarding meeting if one exists, otherwise the most recent past one.
// Meetings whose activity type isn't a recognised onboarding type are
// ignored entirely (isOnboardingMeeting is the single source of truth for
// that, shared with the meeting-prep dashboard).
function pickObMeetingDate(
  meetings: { startTime: string; activityType: string | null }[],
  nowIso: string
): string | null {
  const nowMs = Date.parse(nowIso);
  let soonestUpcoming: { startTime: string; ms: number } | null = null;
  let mostRecentPast: { startTime: string; ms: number } | null = null;

  for (const m of meetings) {
    if (!isOnboardingMeeting(m.activityType)) continue;
    const ms = Date.parse(m.startTime);
    if (isNaN(ms)) continue;
    if (ms >= nowMs) {
      if (!soonestUpcoming || ms < soonestUpcoming.ms) soonestUpcoming = { startTime: m.startTime, ms };
    } else if (!mostRecentPast || ms > mostRecentPast.ms) {
      mostRecentPast = { startTime: m.startTime, ms };
    }
  }

  return soonestUpcoming?.startTime ?? mostRecentPast?.startTime ?? null;
}

// Maps the HubSpot object-type id prefix of `hs_notes_next_activity` ("object
// coordinates", e.g. "0-27-513733934284") to a human label. Verified live
// against the portal: 0-27 Task, 0-47 Meeting, 0-48 Call, 0-49 Email,
// 0-46 Note, 0-18 Communication.
const NEXT_ACTIVITY_TYPE_BY_OBJECT_ID: Record<string, string> = {
  "0-27": "Task",
  "0-47": "Meeting",
  "0-48": "Call",
  "0-49": "Email",
  "0-46": "Note",
  "0-18": "Communication",
};

export function nextActivityTypeLabel(coordinates: string | null | undefined): string | null {
  if (!coordinates) return null;
  const trimmed = coordinates.trim();
  if (!trimmed) return null;
  const match = /^(\d+-\d+)-/.exec(trimmed);
  if (!match) return "Activity";
  return NEXT_ACTIVITY_TYPE_BY_OBJECT_ID[match[1]] ?? "Activity";
}

export function buildRow(input: BuildRowInput): PortfolioRow {
  const stage = classifyPortfolioStage(
    input.deal.customerStage,
    input.deal.pipelineId,
    input.deal.customerSubstage,
    input.deal.dealstageId ?? null
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
    openInvoiceCount: input.deal.openInvoiceCount,
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
    dealstageId: input.deal.dealstageId ?? null,
    pipelineId: input.deal.pipelineId,
    nextStep: input.deal.nextStep,
    experiencesCreated: input.company.experiencesCreated,
    hasHadEvent: input.company.hasHadEvent,
    latestEventAt: input.company.latestEventAt,
    obMeetingAt: input.deal.obMeetingAt,
    nextActivityAt: input.deal.nextActivityAt,
    nextActivityType: input.deal.nextActivityType,
    dealId: input.deal.dealId,
    nextMeetingAt: input.deal.nextMeetingAt,
    contactEmail: input.contactEmail,
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
  options: { refresh?: boolean; spans?: { label: string; ms: number }[] } = {}
): Promise<PortfolioResponse> {
  const cacheKey = `portfolio:${ownerIdsCsv ?? "all"}`;
  if (!options.refresh) {
    const cached = portfolioCache.get(cacheKey);
    if (cached) return cached;
  }
  return portfolioCache.getOrBuild(cacheKey, async () => {
    const rows = await fetchPortfolioRows(ownerIdsCsv, options.spans);
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
  "hs_next_step",
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
  "deal_currency_code",
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
  // Next activity (date + type) surfaced on ongoing kanban cards.
  "notes_next_activity_date",
  "hs_notes_next_activity",
  // Next booked meeting start time, surfaced as its own dedicated line on
  // ongoing kanban cards (see nextMeetingLabel in portfolio-kanban.ts).
  "hs_next_meeting_start_time",
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
  "number_of_experiences_created",
  "understory_has_had_event",
  "understory_latest_event",
];

interface RawDeal {
  id: string;
  properties: Record<string, string>;
}

// Paged search across one pipeline. Mirrors the canonical retry-aware helper
// in `pay-migration.ts`. Always passes a `sorts` clause (HubSpot search
// pagination silently truncates without one) and delegates to
// `searchObjectsPage` for the 429/5xx retry loop.
async function fetchPortfolioDealsForPipeline(
  pipelineId: string,
  ownerIds: string[] | null
): Promise<RawDeal[]> {
  const out: RawDeal[] = [];
  let after: string | undefined;
  // Push as much filtering as possible into the search so we page through
  // fewer results: owner scope (a person filter used to fetch the full ~700
  // deal pool and filter in memory) and the always-applied churn/closed
  // exclusions. The in-memory filters below stay as belt-and-braces.
  const filters: unknown[] = [
    { propertyName: "pipeline", operator: "EQ", value: pipelineId },
    { propertyName: "customer_stage", operator: "NEQ", value: "Churned" },
    { propertyName: "churn_date", operator: "NOT_HAS_PROPERTY" },
    { propertyName: "hs_is_closed", operator: "NEQ", value: "true" },
  ];
  if (ownerIds && ownerIds.length > 0) {
    filters.push({ propertyName: "hubspot_owner_id", operator: "IN", values: ownerIds });
  }
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters }],
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

// Bulk primary-contact email lookup for ALL portfolio deals, feeding the
// kanban card's "Copy email" action. Mirrors the company-detail selection in
// `fetchPrimaryContact` (hubspot.ts: company -> associations/contacts,
// limit=1, first result wins) as closely as a bulk fetch allows, with two
// intentional divergences:
//   1. Deal-level, not company-level - a company can back several deals with
//      different associated contacts, and the card is deal-scoped.
//   2. Picks the first associated contact with a NON-EMPTY email, not just
//      the first associated contact (fetchPrimaryContact would happily
//      return a contact with no email at all, since it also surfaces
//      name/phone; here email is the only thing the card needs).
// Company-level fallback is explicitly out of scope (see task brief).
async function fetchContactEmailsForDeals(dealIds: string[]): Promise<Map<string, string>> {
  const assocs = await fetchAssociations("deals", "contacts", dealIds);
  const uniqueContactIds = Array.from(new Set(assocs.flatMap((a) => a.toIds)));
  if (uniqueContactIds.length === 0) return new Map();

  const contactProps = await fetchObjectsBatch("contacts", uniqueContactIds, ["email"]);

  const out = new Map<string, string>();
  for (const a of assocs) {
    for (const contactId of a.toIds) {
      const email = contactProps.get(contactId)?.email?.trim();
      if (email) {
        out.set(a.fromId, email);
        break;
      }
    }
  }
  return out;
}

// Universe fetcher. Returns one PortfolioRow per (deal, company) pair across
// both pipelines, after applying the Churned-stage filter and the optional
// owner filter. Mirrors `fetchNoFutureEvents` step-by-step but without the
// upcoming-events filter, since Portfolio shows the whole universe.
export async function fetchPortfolioRows(
  ownerIdsCsv: string | null,
  spans?: { label: string; ms: number }[]
): Promise<PortfolioRow[]> {
  const mark = (label: string, t0: number) => {
    spans?.push({ label, ms: Math.round(performance.now() - t0) });
  };
  // Owner scope parsed up front so it can ride the HubSpot query (2a) as well
  // as the in-memory filter (2d). `null` and "all" both mean unfiltered.
  const ownerFilter = ownerIdsCsv && ownerIdsCsv !== "all"
    ? new Set(ownerIdsCsv.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
  const ownerIdList = ownerFilter ? Array.from(ownerFilter) : null;

  // Owner directory kicked off at t=0 — it returns the full directory for
  // any non-empty input (and [] short-circuits to {}), so seed it with the
  // static CS owner ids; no data dependency on the deal pool.
  const ownerNamesPromise = fetchOwnerNames(OWNERS.map((o) => o.id));

  // Step 2a: search both pipelines in parallel.
  const tDeals = performance.now();
  const [lifecycleDeals, retentionDeals] = await Promise.all([
    fetchPortfolioDealsForPipeline(LIFECYCLE_PIPELINE_ID, ownerIdList),
    fetchPortfolioDealsForPipeline(RETENTION_PIPELINE_ID, ownerIdList),
  ]);
  mark("hubspot.deals", tDeals);
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

  // OB meeting starts: kicked off here (before step 2b's associations await)
  // so it overlaps with steps 2b/2c instead of adding to the critical path.
  // Only deals in the OB-meeting stages need the lookup.
  const obDealIds = allDeals
    .filter(
      (d) =>
        d.properties.pipeline === LIFECYCLE_PIPELINE_ID &&
        (OB_MEETING_STAGE_IDS.has(d.properties.dealstage) ||
          !MAPPED_BOARD_DEALSTAGE_IDS.has(d.properties.dealstage))
    )
    .map((d) => d.id);
  const obMeetingsPromise = obDealIds.length
    ? fetchMeetingStartsForDeals(obDealIds).catch(
        () => new Map<string, { startTime: string; activityType: string | null }[]>()
      )
    : Promise.resolve(new Map<string, { startTime: string; activityType: string | null }[]>());

  // Primary-contact emails: kicked off here too, for the same reason as
  // obMeetingsPromise above - overlaps with the assoc/companies work below
  // instead of adding to the critical path. Scoped to ALL portfolio deals
  // (every ongoing card gets a "Copy email" action), best-effort.
  const contactEmailsPromise = fetchContactEmailsForDeals(allDeals.map((d) => d.id)).catch(
    () => new Map<string, string>()
  );

  // Step 2b: deal -> company associations via the shared retry-aware helper.
  // (The previous hand-rolled version had no retry, so a transient 429 under
  // warm-cycle load silently dropped whole 100-deal slices from the payload.)
  const tAssoc = performance.now();
  const dealToCompany = new Map<string, string>();
  const assocs = await fetchAssociations("deals", "companies", allDeals.map((d) => d.id));
  for (const a of assocs) {
    if (a.toIds[0] && !dealToCompany.has(a.fromId)) {
      dealToCompany.set(a.fromId, a.toIds[0]);
    }
  }
  mark("hubspot.assoc", tAssoc);
  if (dealToCompany.size === 0) return [];

  const uniqueCompanyIds = Array.from(new Set(dealToCompany.values()));

  // Step 2c: company properties via v3 batch (parallel).
  const tCompanies = performance.now();
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
  mark("hubspot.companies", tCompanies);

  // Step 2e: owner directory, OB meeting starts, and contact emails - all
  // kicked off earlier.
  const ownerNames = await ownerNamesPromise;
  // Captured immediately before the await so the span measures only the
  // residual wait, not the assoc/companies work it overlapped with above.
  const tObMeetings = performance.now();
  const obMeetingsByDeal = await obMeetingsPromise;
  mark("hubspot.obMeetings", tObMeetings);
  const tContacts = performance.now();
  const contactEmailsByDeal = await contactEmailsPromise;
  mark("hubspot.contacts", tContacts);

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

    const experiencesCreatedRaw = parseFloat(props.number_of_experiences_created || "");
    const experiencesCreated =
      isNaN(experiencesCreatedRaw) || experiencesCreatedRaw < 0
        ? null
        : Math.round(experiencesCreatedRaw);

    const hasHadEventRaw = (props.understory_has_had_event || "").trim();
    const hasHadEvent =
      hasHadEventRaw === ""
        ? null
        : ["true", "yes"].includes(hasHadEventRaw.toLowerCase());

    const latestEventAt = toIsoDateOnly(props.understory_latest_event);

    // Only deals in an OB-meeting stage were fetched above, so a missing
    // entry means "not in scope" and stays null without calling the picker.
    const obMeetingsForDeal = obMeetingsByDeal.get(deal.id);
    const obMeetingAt = obMeetingsForDeal
      ? pickObMeetingDate(obMeetingsForDeal, nowIso)
      : null;

    rows.push(buildRow({
      nowIso,
      contactEmail: contactEmailsByDeal.get(deal.id) ?? null,
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
        experiencesCreated,
        hasHadEvent,
        latestEventAt,
      },
      deal: {
        dealId: deal.id,
        customerStage: dealProps.customer_stage || "",
        customerSubstage: dealProps.customer_substage || null,
        dealstageId: dealProps.dealstage || null,
        pipelineId: dealProps.pipeline || "",
        enteredStageDate: dealProps.hs_v2_date_entered_current_stage || null,
        customerLiveDate: dealProps.customer_live_date || null,
        nextStep: dealProps.hs_next_step?.trim() || null,
        obMeetingAt,
        nextMeetingAt: dealProps.hs_next_meeting_start_time || null,
        nextActivityAt: dealProps.notes_next_activity_date || null,
        nextActivityType: nextActivityTypeLabel(dealProps.hs_notes_next_activity),
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
      } else if (key) {
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
export const __test = { aggregatePayload, pickObMeetingDate, nextActivityTypeLabel };
