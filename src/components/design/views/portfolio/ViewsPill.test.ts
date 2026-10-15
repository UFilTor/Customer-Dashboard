import { describe, expect, it } from "vitest";
import { type PortfolioViewState } from "@/lib/portfolio-views";
import { sameFilters } from "./ViewsPill";

function viewState(overrides: Partial<PortfolioViewState> = {}): PortfolioViewState {
  return {
    signals: [],
    stackedSignals: false,
    refine: {},
    shownStatuses: { paused: false, product_hold: false, hibernation: false, snoozed: false },
    sortKey: "urgency",
    sortDirection: "desc",
    collapsedStages: [],
    ...overrides,
  };
}

describe("sameFilters (Views pill 'edited' marker)", () => {
  it("treats identical filters as not edited", () => {
    expect(sameFilters(viewState(), viewState())).toBe(true);
  });

  it("ignores sort and collapsed board columns", () => {
    const saved = viewState();
    const current = viewState({ sortKey: "revenue", sortDirection: "asc", collapsedStages: ["established"] });
    expect(sameFilters(saved, current)).toBe(true);
  });

  it("ignores signal and list order", () => {
    const saved = viewState({
      signals: ["health_dropped", "overdue_invoices"],
      refine: { stages: ["Ramp Up", "Established"] },
    });
    const current = viewState({
      signals: ["overdue_invoices", "health_dropped"],
      refine: { stages: ["Established", "Ramp Up"] },
    });
    expect(sameFilters(saved, current)).toBe(true);
  });

  it("treats empty lists and unset Refine fields as the same", () => {
    expect(sameFilters(viewState({ refine: { stages: [], products: [] } }), viewState({ refine: {} }))).toBe(true);
  });

  it("keeps a zero bound as a real filter", () => {
    expect(sameFilters(viewState({ refine: { acvMin: 0 } }), viewState({ refine: {} }))).toBe(false);
  });

  it("flags a changed signal, match mode, Refine value or status", () => {
    const saved = viewState({ signals: ["health_dropped"] });
    expect(sameFilters(saved, viewState({ signals: ["overdue_invoices"] }))).toBe(false);
    expect(sameFilters(saved, viewState({ signals: ["health_dropped"], stackedSignals: true }))).toBe(false);
    expect(sameFilters(saved, viewState({ signals: ["health_dropped"], refine: { healthMaxScore: 40 } }))).toBe(false);
    expect(
      sameFilters(
        saved,
        viewState({
          signals: ["health_dropped"],
          shownStatuses: { paused: true, product_hold: false, hibernation: false, snoozed: false },
        })
      )
    ).toBe(false);
  });
});
