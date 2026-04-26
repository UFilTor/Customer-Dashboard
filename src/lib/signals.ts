import type { AttentionSignal, AttentionGroup, AttentionCompany } from "./types";

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

export function flattenGroups(groups: AttentionGroup[]): FlatCompany[] {
  const seen = new Set<string>();
  const out: FlatCompany[] = [];
  for (const g of groups) {
    for (const c of g.companies) {
      const key = `${g.signal}:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...c, signal: g.signal });
    }
  }
  return out;
}
