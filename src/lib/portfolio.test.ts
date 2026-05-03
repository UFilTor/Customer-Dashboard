import { describe, it, expect } from "vitest";
import { classifyPortfolioStage, isSignalApplicable, extractSortKey, getSortOptions } from "./portfolio";
import type { PortfolioRow } from "./types";

function row(overrides: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    id: "1",
    name: "Example",
    domain: null,
    ownerId: null,
    ownerName: null,
    stage: "Established",
    daysInStage: null,
    customerLiveDate: null,
    revenue: 0,
    healthScore: null,
    daysSinceContact: null,
    signals: [],
    overdueDays: null,
    daysUntilDue: null,
    outstandingEur: null,
    openInvoiceCount: null,
    daysSilent: null,
    healthDrop: null,
    daysPastExpectedStep: null,
    volumeDropPct: null,
    prior3mVolume: null,
    wishToChurnAt: null,
    ...overrides,
  };
}

describe("classifyPortfolioStage", () => {
  it("maps onboarding-flavored HubSpot values", () => {
    expect(classifyPortfolioStage("Onboarding", null)).toBe("Onboarding");
    expect(classifyPortfolioStage("Adopted", null)).toBe("Adopted");
    expect(classifyPortfolioStage("Started", null)).toBe("Started");
  });

  it("maps retention-flavored HubSpot values", () => {
    expect(classifyPortfolioStage("Ramp Up", null)).toBe("Ramp Up");
    expect(classifyPortfolioStage("Established", null)).toBe("Established");
  });

  it("falls back to Established for unknown stages so the row still appears", () => {
    expect(classifyPortfolioStage("", null)).toBe("Established");
    expect(classifyPortfolioStage("Some Future Stage", null)).toBe("Established");
  });
});

describe("isSignalApplicable", () => {
  it("allows stuck_in_step only on Onboarding/Adopted/Started", () => {
    expect(isSignalApplicable("stuck_in_step", "Onboarding")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Adopted")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Started")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Ramp Up")).toBe(false);
    expect(isSignalApplicable("stuck_in_step", "Established")).toBe(false);
  });

  it("allows volume_declining only on Ramp Up + Established", () => {
    expect(isSignalApplicable("volume_declining", "Onboarding")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Adopted")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Started")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Ramp Up")).toBe(true);
    expect(isSignalApplicable("volume_declining", "Established")).toBe(true);
  });

  it("allows overdue_invoices on every stage", () => {
    for (const stage of ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"] as const) {
      expect(isSignalApplicable("overdue_invoices", stage)).toBe(true);
    }
  });
});

describe("extractSortKey", () => {
  it("returns universal values", () => {
    expect(extractSortKey(row({ revenue: 1234 }), "revenue")).toBe(1234);
    expect(extractSortKey(row({ healthScore: 55 }), "health")).toBe(55);
    expect(extractSortKey(row({ daysSinceContact: 12 }), "last_contact")).toBe(12);
    expect(extractSortKey(row({ name: "Acme" }), "name")).toBe("Acme");
  });

  it("returns null for signal-specific keys when signal is not firing", () => {
    expect(extractSortKey(row(), "oldest_outstanding")).toBeNull();
    expect(extractSortKey(row(), "biggest_pct_drop")).toBeNull();
  });

  it("returns signal-specific values when present", () => {
    expect(extractSortKey(row({ overdueDays: 14 }), "oldest_outstanding")).toBe(14);
    expect(extractSortKey(row({ outstandingEur: 5000 }), "value_overdue")).toBe(5000);
    expect(extractSortKey(row({ volumeDropPct: 0.7 }), "biggest_pct_drop")).toBe(0.7);
  });

  it("returns daysUntilDue for due_soonest sort on open invoices", () => {
    expect(extractSortKey(row({ daysUntilDue: 5 }), "due_soonest")).toBe(5);
    expect(extractSortKey(row(), "due_soonest")).toBeNull();
  });
});

describe("getSortOptions", () => {
  it("returns universal sorts when no signal is selected", () => {
    const opts = getSortOptions([]);
    const keys = opts.map((o) => o.key);
    expect(keys).toContain("urgency");
    expect(keys).toContain("revenue");
    expect(keys).not.toContain("oldest_outstanding");
  });

  it("adds signal-specific sorts when exactly one signal is selected", () => {
    const opts = getSortOptions(["overdue_invoices"]);
    const keys = opts.map((o) => o.key);
    expect(keys).toContain("urgency");
    expect(keys).toContain("oldest_outstanding");
    expect(keys).toContain("value_overdue");
    expect(keys).toContain("count_overdue");
  });

  it("omits signal-specific sorts when 2+ signals are selected", () => {
    const opts = getSortOptions(["overdue_invoices", "wish_to_churn"]);
    const keys = opts.map((o) => o.key);
    expect(keys).toContain("urgency");
    expect(keys).not.toContain("oldest_outstanding");
    expect(keys).not.toContain("wish_flagged_recent");
  });
});
