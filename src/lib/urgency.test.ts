import { describe, it, expect } from "vitest";
import { urgencyScore } from "./urgency";
import type { AttentionCompany } from "./types";

function company(overrides: Partial<AttentionCompany & { signal?: string }> = {}) {
  return { id: "1", name: "x", detail: "", ...overrides };
}

describe("urgencyScore", () => {
  it("ranks an overdue invoice higher than a health drop at equal revenue", () => {
    const overdue = urgencyScore(company({ signal: "overdue_invoices", daysOverdue: 7, revenue: 10000 }));
    const health  = urgencyScore(company({ signal: "health_score", previousCategory: "80", healthScore: "50", revenue: 10000 }));
    expect(overdue).toBeGreaterThan(health);
  });

  it("ranks wish_to_churn highly", () => {
    const wish = urgencyScore(company({ signal: "wish_to_churn", revenue: 10000 }));
    const quiet = urgencyScore(company({ signal: "gone_quiet", daysSilent: 40, revenue: 10000 }));
    expect(wish).toBeGreaterThan(quiet);
  });

  it("ranks volume_declining higher than no_future_events at same revenue", () => {
    const decline = urgencyScore(company({ signal: "volume_declining", revenue: 10000 }));
    const events  = urgencyScore(company({ signal: "no_future_events", daysSilent: 0, revenue: 10000 }));
    expect(decline).toBeGreaterThan(events);
  });

  it("breaks ties by revenue", () => {
    const big    = urgencyScore(company({ signal: "stuck_in_step", revenue: 50000 }));
    const small  = urgencyScore(company({ signal: "stuck_in_step", revenue: 1000 }));
    expect(big).toBeGreaterThan(small);
  });
});
