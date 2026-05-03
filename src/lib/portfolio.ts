import { computeWatchOutSignals } from "./signals";
import type {
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
