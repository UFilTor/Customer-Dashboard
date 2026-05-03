import type { AttentionCompany } from "./types";

// Urgency score for ranking accounts within and across signal groups.
// Weights mirror the spec at
// docs/superpowers/specs/2026-05-03-portfolio-dashboard-design.md:
// bad-severity signals score above warn-severity at equal revenue, with
// revenue as the universal tie-breaker. Designed for both the legacy Status
// dashboard and the new Portfolio dashboard.
export function urgencyScore(c: AttentionCompany & { signal?: string }): number {
  const rev = (c.revenue || 0) / 1000;

  // Bad-severity signals: score from a high base.
  if (c.signal === "overdue_invoices" || c.daysOverdue != null) {
    return (c.daysOverdue ?? 0) * 100 + 5000 + rev;
  }
  if (c.signal === "wish_to_churn") return 4500 + rev;
  if (c.signal === "volume_declining") return 4000 + rev;
  if (c.signal === "no_future_events") {
    // daysSilent for no_future_events tracks "days since last event", fold
    // it in linearly so accounts that have been quiet longer surface higher.
    return 3500 + (c.daysSilent ?? 0) * 2 + rev;
  }

  // Warn-severity signals.
  if (c.signal === "open_invoices") {
    return 2500 + (c.daysOverdue ?? 0) * 10 + rev;
  }
  if (c.signal === "stuck_in_step") return 2000 + rev;
  if (c.signal === "health_dropped" || c.signal === "health_score") {
    // previousCategory and healthScore are stored as 0-100 numeric strings
    // (e.g. "80", "50"), so we scale the raw point delta directly without
    // any extra multiplier. A 30-point drop adds 30 on top of the 1500 base,
    // keeping warn-severity below bad-severity bases at equal revenue.
    const prev = parseFloat(c.previousCategory || "0") || 0;
    const cur = parseFloat(c.healthScore || "0") || 0;
    const drop = Math.max(0, prev - cur);
    return 1500 + drop + rev;
  }
  if (c.signal === "gone_quiet" || c.daysSilent != null) {
    return 1000 + (c.daysSilent ?? 0) * 5 + rev;
  }

  // Healthy account: revenue only.
  return rev;
}
