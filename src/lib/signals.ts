import type {
  AttentionSignal,
  AttentionGroup,
  AttentionCompany,
  WatchOutSignal,
  WatchOutSignalSeverity,
  PortfolioSignalKey,
  PortfolioStage,
} from "./types";

// Stage gating, system-wide. The Portfolio dashboard pioneered this set of
// rules to silence noisy signals on stages where they don't carry useful
// meaning (e.g. health drops on Onboarding, where the score isn't stable
// yet). Now lifted into signals.ts so every consumer of computeWatchOutSignals
// gets the same gating applied — Portfolio and Meeting Prep stay in sync
// without a per-call duplicate filter.
export const STAGE_APPLICABILITY: Record<PortfolioSignalKey, PortfolioStage[]> = {
  overdue_invoices:  ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  open_invoices:     ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  no_future_events:  ["Adopted", "Started", "Ramp Up", "Established"],
  health_dropped:    ["Adopted", "Started", "Ramp Up", "Established"],
  gone_quiet:        ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  wish_to_churn:     ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  stuck_in_step:     ["Onboarding", "Adopted", "Started"],
  volume_declining:  ["Ramp Up", "Established"],
  not_on_pay:        ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
};

export function isSignalApplicable(signal: PortfolioSignalKey, stage: PortfolioStage): boolean {
  return STAGE_APPLICABILITY[signal].includes(stage);
}

// Internal: map a watch-out signal back to its PortfolioSignalKey so the
// stage filter can apply by key. The "Open invoice" title overrides the
// underlying overdue_invoice kind because we synthesize open-invoice as a
// sibling of overdue at the call site, but compute does not produce the
// open-invoice variant directly — open invoice handling stays where it was.
function watchOutToKey(s: WatchOutSignal): PortfolioSignalKey {
  if (s.title === "Open invoice") return "open_invoices";
  switch (s.kind) {
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

export interface SignalMeta {
  key: AttentionSignal;
  label: string;
  short: string;
  color: string;
  urgent: boolean;
}

export const SIGNALS: SignalMeta[] = [
  { key: "overdue_invoices", label: "Overdue invoices", short: "Overdue inv.", color: "#B84A2D", urgent: true },
  { key: "open_invoices", label: "Open invoices", short: "Open inv.", color: "#B8761F", urgent: false },
  { key: "no_future_events", label: "No future events", short: "No events", color: "#B84A2D", urgent: true },
  { key: "health_score", label: "Health decline", short: "Health drop", color: "#2F5C3E", urgent: false },
];

export const SIGNAL_MAP: Record<AttentionSignal, SignalMeta> = Object.fromEntries(
  SIGNALS.map((s) => [s.key, s])
) as Record<AttentionSignal, SignalMeta>;

// Order in which signal sections render in Briefing + Split.
// Briefing's top-3 priority cards still use the global urgencyScore — this
// order applies to the section breakdown below them and to Split's sidebar.
export const SECTION_ORDER: AttentionSignal[] = [
  "overdue_invoices",
  "open_invoices",
  "no_future_events",
  "health_score",
];

// Per-signal sort. Each group surfaces what matters for that signal first,
// then falls back to revenue as a tie-breaker.
export function sortBySignal<T extends AttentionCompany & { signal?: AttentionSignal }>(
  signal: AttentionSignal,
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    if (signal === "overdue_invoices") {
      const da = a.daysOverdue ?? 0;
      const db = b.daysOverdue ?? 0;
      if (db !== da) return db - da;
    } else if (signal === "no_future_events") {
      const da = a.daysSilent ?? 0;
      const db = b.daysSilent ?? 0;
      if (db !== da) return db - da;
    } else if (signal === "health_score") {
      const dropA = (parseFloat(a.previousCategory || "0") - parseFloat(a.healthScore || "0")) || 0;
      const dropB = (parseFloat(b.previousCategory || "0") - parseFloat(b.healthScore || "0")) || 0;
      if (dropB !== dropA) return dropB - dropA;
    }
    return (b.revenue || 0) - (a.revenue || 0);
  });
}

export type FlatCompany = AttentionCompany & { signal: AttentionSignal };

// Flatten signal groups, deduping by company id so each company appears in at
// most one section. Priority follows SECTION_ORDER — a company that's both
// "overdue invoice" and "health drop" surfaces only under overdue invoices.
export function flattenGroups(groups: AttentionGroup[]): FlatCompany[] {
  const bySignal = new Map<AttentionSignal, AttentionCompany[]>();
  for (const g of groups) bySignal.set(g.signal, g.companies);

  const seen = new Set<string>();
  const out: FlatCompany[] = [];

  // Highest-priority signals first.
  for (const signal of SECTION_ORDER) {
    const companies = bySignal.get(signal);
    if (!companies) continue;
    for (const c of companies) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ ...c, signal });
    }
  }

  // Defensive: surface any signal not in SECTION_ORDER (shouldn't happen with
  // current types, but keeps the function lossless if a new signal is added).
  for (const g of groups) {
    if (SECTION_ORDER.includes(g.signal)) continue;
    for (const c of g.companies) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ ...c, signal: g.signal });
    }
  }

  return out;
}

export interface WatchOutContext {
  nowIso: string;
  // Invoice
  unpaidInvoice: boolean;
  invoiceDueDate: string | null;
  outstandingEur: number | null;
  overdueDays: number | null;
  openInvoiceCount?: number | null;
  // Churn intent
  wishToChurn: boolean;
  churnReason: string | null;
  // Volume trend
  volume3m: number;
  volume6m: number;
  // Health
  healthScore: number | null;
  // Future events
  upcomingEvents: number | null;
  // Last contact
  notesLastContacted: string | null;
  // Onboarding only
  daysInStep: number | null;
  expectedDaysInStep: number | null;
  // Pay migration status. When set to one of the not-yet-migrated values,
  // surface a "Not connected to Understory Pay" signal. Null / other values
  // (Verified, Live, Pending Verification, Ineligible, Unwilling) suppress.
  payStatus?: string | null;
  // Optional. When provided, the result is filtered through STAGE_APPLICABILITY
  // so callers don't have to re-apply the gate. Omit to opt out (legacy
  // behaviour: all triggered signals returned regardless of stage).
  stage?: PortfolioStage;
}

const SEVERITY_ORDER: Record<WatchOutSignalSeverity, number> = { bad: 0, warn: 1 };

function fmtEur(n: number): string {
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

export function computeWatchOutSignals(ctx: WatchOutContext): WatchOutSignal[] {
  const out: WatchOutSignal[] = [];
  const now = new Date(ctx.nowIso).getTime();

  // 1. Overdue invoice — bad
  if (ctx.unpaidInvoice && ctx.invoiceDueDate) {
    const due = new Date(ctx.invoiceDueDate).getTime();
    if (!isNaN(due) && due < now) {
      const days = ctx.overdueDays ?? Math.floor((now - due) / (24 * 60 * 60 * 1000));
      const amt = ctx.outstandingEur ? ` · ${fmtEur(ctx.outstandingEur)} EUR outstanding` : "";
      const count = (ctx.openInvoiceCount ?? 0) > 1
        ? ` · ${ctx.openInvoiceCount} invoices`
        : "";
      out.push({
        kind: "overdue_invoice",
        severity: "bad",
        title: "Overdue invoice",
        detail: `Invoice overdue ${days} day${days === 1 ? "" : "s"}${amt}${count}`,
      });
    }
  }

  // 2. Wish to churn — bad
  if (ctx.wishToChurn) {
    out.push({
      kind: "wish_to_churn",
      severity: "bad",
      title: "Wish-to-churn flagged",
      detail: ctx.churnReason ?? "No reason provided",
    });
  }

  // 3. Volume declining — bad
  // last 3m < 50% of prior 3m (months 4-6)
  const prior3m = Math.max(0, ctx.volume6m - ctx.volume3m);
  if (prior3m > 0 && ctx.volume3m < prior3m * 0.5) {
    out.push({
      kind: "volume_declining",
      severity: "bad",
      title: "Volume declining",
      detail: `Last 3m ${fmtEur(ctx.volume3m)} EUR vs prior 3m ${fmtEur(prior3m)} EUR`,
    });
  }

  // 4. Health dropped — warn
  if (ctx.healthScore != null && ctx.healthScore < 60) {
    out.push({
      kind: "health_dropped",
      severity: "warn",
      title: `Health score ${Math.round(ctx.healthScore)}`,
      detail: "Below the 60 threshold — review sub-scores",
    });
  }

  // 5. No future events - bad. The HubSpot field is a 0-1 score where
  // 0 means literally zero events scheduled. Anything > 0 (even 0.20 = 1
  // event) does not trigger; null means data is missing, also no trigger.
  if (ctx.upcomingEvents === 0) {
    out.push({
      kind: "no_future_events",
      severity: "bad",
      title: "No upcoming events",
      detail: "Storefront has nothing scheduled",
    });
  }

  // 6. Gone quiet — warn (30+ days) or bad (45+ days)
  if (ctx.notesLastContacted) {
    const last = new Date(ctx.notesLastContacted).getTime();
    if (!isNaN(last)) {
      const days = Math.floor((now - last) / (24 * 60 * 60 * 1000));
      if (days >= 45) {
        out.push({
          kind: "gone_quiet",
          severity: "bad",
          title: `Last contact ${days} days ago`,
          detail: `No outbound since ${ctx.notesLastContacted.slice(0, 10)}`,
        });
      } else if (days >= 30) {
        out.push({
          kind: "gone_quiet",
          severity: "warn",
          title: `Last contact ${days} days ago`,
          detail: `No outbound since ${ctx.notesLastContacted.slice(0, 10)}`,
        });
      }
    }
  }

  // 7. Not connected to Understory Pay — warn. Fires when the lifecycle
  // deal's `understory_pay_status__customer` is one of the pre-migration
  // states ("Not yet enrolled", "Signed - Not Started", "Started Onboarding").
  if (
    ctx.payStatus === "Not yet enrolled" ||
    ctx.payStatus === "Signed - Not Started" ||
    ctx.payStatus === "Started Onboarding"
  ) {
    out.push({
      kind: "not_on_pay",
      severity: "warn",
      title: "Not on Understory Pay",
      detail: ctx.payStatus,
    });
  }

  // 8. Stuck in step — warn (Onboarding only — pass null for retention)
  if (ctx.daysInStep != null && ctx.expectedDaysInStep != null && ctx.daysInStep > ctx.expectedDaysInStep) {
    out.push({
      kind: "stuck_in_step",
      severity: "warn",
      title: `${ctx.daysInStep} days in step`,
      detail: `Expected ${ctx.expectedDaysInStep} — past due`,
    });
  }

  // Stage gating: drop signals not applicable for the deal's stage. Caller
  // must pass `stage` to opt in; legacy callers without stage receive the
  // full unfiltered list (matches pre-Option-1 behaviour).
  const filtered = ctx.stage
    ? out.filter((s) => isSignalApplicable(watchOutToKey(s), ctx.stage as PortfolioStage))
    : out;

  // Stable order: bad first, then warn, preserving insertion order within each
  // severity (matches the order of rules above).
  return [...filtered].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export interface PortfolioSignalMeta {
  key: PortfolioSignalKey;
  label: string;
  short: string;
  color: string;
  severity: "bad" | "warn";
}

// 9-signal taxonomy used by the Portfolio dashboard. Sorted alphabetically by
// label — keyboard 1-9 maps to this order, and the section grouping in the
// row list (when 2+ signals are selected) renders sections in this order.
export const PORTFOLIO_SIGNALS: PortfolioSignalMeta[] = [
  { key: "gone_quiet",         label: "Gone quiet",         short: "Quiet",       color: "#3D4E5F", severity: "warn" },
  { key: "health_dropped",     label: "Health drop",        short: "Health",      color: "#2F5C3E", severity: "warn" },
  { key: "no_future_events",   label: "No future events",   short: "No events",   color: "#B84A2D", severity: "bad"  },
  { key: "not_on_pay",         label: "Not on Pay",         short: "Not on Pay",  color: "#B8761F", severity: "warn" },
  { key: "open_invoices",      label: "Open invoices",      short: "Open inv.",   color: "#B8761F", severity: "warn" },
  { key: "overdue_invoices",   label: "Overdue invoices",   short: "Overdue",     color: "#B84A2D", severity: "bad"  },
  { key: "stuck_in_step",      label: "Stuck in step",      short: "Stuck",       color: "#B8761F", severity: "warn" },
  { key: "volume_declining",   label: "Volume declining",   short: "Vol. drop",   color: "#B84A2D", severity: "bad"  },
  { key: "wish_to_churn",      label: "Wish to churn",      short: "Wish churn",  color: "#B84A2D", severity: "bad"  },
];

export const PORTFOLIO_SIGNAL_MAP: Record<PortfolioSignalKey, PortfolioSignalMeta> =
  Object.fromEntries(PORTFOLIO_SIGNALS.map((s) => [s.key, s])) as Record<
    PortfolioSignalKey,
    PortfolioSignalMeta
  >;

// Order keyboard 1-8 maps to. Identical to PORTFOLIO_SIGNALS' index sequence.
export const PORTFOLIO_SIGNAL_ORDER: PortfolioSignalKey[] = PORTFOLIO_SIGNALS.map((s) => s.key);
