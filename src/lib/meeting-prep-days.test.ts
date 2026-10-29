import { describe, expect, it } from "vitest";
import { carryOverLazyDays } from "./meeting-prep-days";

const entry = (id: string, startsAt: string) => ({ id, meeting: { startsAt } });
const dayOf = (e: { meeting: { startsAt: string } }) => e.meeting.startsAt.slice(0, 10);

describe("carryOverLazyDays", () => {
  const fresh = [entry("a", "2026-10-29T09:00:00Z"), entry("b", "2026-10-30T10:00:00Z")];
  const previous = [
    entry("old-a", "2026-10-29T09:00:00Z"),
    entry("lazy-1", "2026-11-10T08:00:00Z"),
    entry("lazy-2", "2026-11-10T13:00:00Z"),
    entry("other", "2026-11-12T08:00:00Z"),
  ];

  it("returns the fresh list unchanged when no day was loaded on demand", () => {
    expect(carryOverLazyDays(fresh, previous, new Set(), dayOf)).toBe(fresh);
  });

  it("keeps every meeting on an on-demand day, sorted into the fresh list", () => {
    const out = carryOverLazyDays(fresh, previous, new Set(["2026-11-10"]), dayOf);
    expect(out.map((e) => e.id)).toEqual(["a", "b", "lazy-1", "lazy-2"]);
  });

  it("drops seeded-window meetings from the previous list (fresh wins)", () => {
    const out = carryOverLazyDays(fresh, previous, new Set(["2026-11-10"]), dayOf);
    expect(out.some((e) => e.id === "old-a")).toBe(false);
  });

  it("returns the fresh list when the on-demand day had no meetings", () => {
    expect(carryOverLazyDays(fresh, previous, new Set(["2026-11-20"]), dayOf)).toBe(fresh);
  });

  it("handles an empty fresh payload", () => {
    const out = carryOverLazyDays([], previous, new Set(["2026-11-12"]), dayOf);
    expect(out.map((e) => e.id)).toEqual(["other"]);
  });
});
