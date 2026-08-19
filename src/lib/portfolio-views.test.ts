import { describe, it, expect, beforeEach } from "vitest";
import {
  deleteView,
  getDefaultSavedView,
  getDefaultViewId,
  getSavedViews,
  saveView,
  setDefaultView,
  type PortfolioViewState,
} from "./portfolio-views";

const KEY = "ud-v2-portfolio-views";

const baseState: PortfolioViewState = {
  signals: ["overdue_invoices"],
  stackedSignals: false,
  refine: { acvMin: 1000 },
  shownStatuses: { paused: true, product_hold: false, hibernation: false, snoozed: false },
  sortKey: "revenue",
  sortDirection: "asc",
};

beforeEach(() => {
  localStorage.clear();
});

describe("portfolio-views", () => {
  it("saves and reads back a view", () => {
    const saved = saveView("Churn risks", baseState);
    expect(saved).not.toBeNull();
    const views = getSavedViews();
    expect(views.length).toBe(1);
    expect(views[0].name).toBe("Churn risks");
    expect(views[0].state.signals).toEqual(["overdue_invoices"]);
    expect(views[0].state.refine.acvMin).toBe(1000);
    expect(views[0].state.sortKey).toBe("revenue");
    expect(views[0].state.sortDirection).toBe("asc");
  });

  it("same name replaces instead of duplicating", () => {
    saveView("My view", baseState);
    saveView("my view", { ...baseState, sortKey: "name" });
    const views = getSavedViews();
    expect(views.length).toBe(1);
    expect(views[0].state.sortKey).toBe("name");
  });

  it("rejects empty names", () => {
    expect(saveView("   ", baseState)).toBeNull();
    expect(getSavedViews().length).toBe(0);
  });

  it("deletes by id", () => {
    const saved = saveView("Temp", baseState)!;
    deleteView(saved.id);
    expect(getSavedViews().length).toBe(0);
  });

  it("sanitizes poisoned state on read", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        {
          id: "v-x",
          name: "Poisoned",
          createdAt: 1,
          state: {
            signals: ["overdue_invoices", "not_a_signal", 42],
            stackedSignals: "yes",
            refine: { acvMin: "1e9", stages: ["Onboarding", "FakeStage"], adoptionAfter: "<script>" },
            shownStatuses: { paused: "true", snoozed: true },
            sortKey: "drop_tables",
            sortDirection: "sideways",
          },
        },
      ])
    );
    const [v] = getSavedViews();
    expect(v.state.signals).toEqual(["overdue_invoices"]);
    expect(v.state.stackedSignals).toBe(false);
    expect(v.state.refine.acvMin).toBeUndefined();
    expect(v.state.refine.stages).toEqual(["Onboarding"]);
    expect(v.state.refine.adoptionAfter).toBeUndefined();
    expect(v.state.shownStatuses.paused).toBe(false);
    expect(v.state.shownStatuses.snoozed).toBe(true);
    expect(v.state.sortKey).toBe("urgency");
    expect(v.state.sortDirection).toBe("desc");
  });

  it("returns [] for a corrupt blob", () => {
    localStorage.setItem(KEY, "{{{");
    expect(getSavedViews()).toEqual([]);
  });
});

describe("default view", () => {
  it("sets, reads, and clears the default", () => {
    const v = saveView("Morning triage", baseState)!;
    expect(getDefaultViewId()).toBeNull();
    setDefaultView(v.id);
    expect(getDefaultViewId()).toBe(v.id);
    expect(getDefaultSavedView()?.name).toBe("Morning triage");
    setDefaultView(null);
    expect(getDefaultViewId()).toBeNull();
  });

  it("deleting the default view clears the marker", () => {
    const v = saveView("Temp", baseState)!;
    setDefaultView(v.id);
    deleteView(v.id);
    expect(getDefaultViewId()).toBeNull();
    expect(getDefaultSavedView()).toBeNull();
  });

  it("re-saving over the default view keeps it the default", () => {
    const v1 = saveView("My view", baseState)!;
    setDefaultView(v1.id);
    const v2 = saveView("my view", { ...baseState, sortKey: "name" })!;
    expect(v2.id).not.toBe(v1.id);
    expect(getDefaultViewId()).toBe(v2.id);
    expect(getDefaultSavedView()?.state.sortKey).toBe("name");
  });

  it("ignores a default id that no longer exists", () => {
    localStorage.setItem("ud-v2-portfolio-views-default", "v-gone");
    expect(getDefaultViewId()).toBeNull();
    expect(getDefaultSavedView()).toBeNull();
  });
});
