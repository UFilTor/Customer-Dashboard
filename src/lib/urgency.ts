import type { AttentionCompany } from "./types";

// Urgency score for ranking accounts within and across signal groups.
// Mirrors the design handoff: overdue weighted heaviest, then health drop, then silence.
export function urgencyScore(c: AttentionCompany & { signal?: string }): number {
  if (c.daysOverdue != null) return c.daysOverdue * 100 + (c.revenue || 0) / 1000;
  if (c.signal === "health_score") {
    const prev = parseFloat(c.previousCategory || "0") || 0;
    const cur = parseFloat(c.healthScore || "0") || 0;
    const drop = (prev - cur) * 100;
    return drop * 50 + (c.revenue || 0) / 1000;
  }
  if (c.daysSilent) return c.daysSilent * 5 + (c.revenue || 0) / 1000;
  return (c.revenue || 0) / 1000;
}
