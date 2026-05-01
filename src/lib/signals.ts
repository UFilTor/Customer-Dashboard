import type {
  AttentionSignal,
  AttentionGroup,
  AttentionCompany,
  WatchOutSignal,
  WatchOutSignalSeverity,
} from "./types";

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
  { key: "no_future_events", label: "No future events", short: "No events", color: "#3D4E5F", urgent: false },
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
      out.push({
        kind: "overdue_invoice",
        severity: "bad",
        title: "Overdue invoice",
        detail: `Invoice overdue ${days} day${days === 1 ? "" : "s"}${amt}`,
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

  // 5. No future events — warn
  if (ctx.upcomingEvents == null || ctx.upcomingEvents === 0) {
    out.push({
      kind: "no_future_events",
      severity: "warn",
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

  // 7. Stuck in step — warn (Onboarding only — pass null for retention)
  if (ctx.daysInStep != null && ctx.expectedDaysInStep != null && ctx.daysInStep > ctx.expectedDaysInStep) {
    out.push({
      kind: "stuck_in_step",
      severity: "warn",
      title: `${ctx.daysInStep} days in step`,
      detail: `Expected ${ctx.expectedDaysInStep} — past due`,
    });
  }

  // Stable order: bad first, then warn, preserving insertion order within each
  // severity (matches the order of rules above).
  return [...out].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
