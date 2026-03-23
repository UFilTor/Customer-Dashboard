import { describe, it, expect } from "vitest";
import { filterEngagements } from "./filter-activities";
import type { Engagement } from "./types";

const makeEngagement = (
  overrides: Partial<Engagement>
): Engagement => ({
  type: "note",
  title: "Test",
  body: "",
  bodyPreview: "",
  summary: "",
  timestamp: String(Date.now()),
  ...overrides,
});

const now = Date.now();
const daysAgo = (d: number) => String(now - d * 86400000);

describe("filterEngagements", () => {
  const engagements = [
    makeEngagement({ type: "call", timestamp: daysAgo(5) }),
    makeEngagement({ type: "email", timestamp: daysAgo(15) }),
    makeEngagement({ type: "meeting", timestamp: daysAgo(35) }),
    makeEngagement({ type: "note", timestamp: daysAgo(65) }),
  ];

  it("returns all when no filters applied", () => {
    const result = filterEngagements(engagements, { types: null, daysBack: 90 });
    expect(result).toHaveLength(4);
  });

  it("filters by single type", () => {
    const result = filterEngagements(engagements, { types: ["call"], daysBack: 90 });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("call");
  });

  it("filters by multiple types", () => {
    const result = filterEngagements(engagements, { types: ["call", "email"], daysBack: 90 });
    expect(result).toHaveLength(2);
  });

  it("filters by date range", () => {
    const result = filterEngagements(engagements, { types: null, daysBack: 30 });
    expect(result).toHaveLength(2);
  });

  it("combines type and date filters", () => {
    const result = filterEngagements(engagements, { types: ["call", "meeting"], daysBack: 30 });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("call");
  });

  it("handles ISO date string timestamps", () => {
    const isoEngagement = makeEngagement({
      type: "call",
      timestamp: new Date(now - 10 * 86400000).toISOString(),
    });
    const result = filterEngagements([isoEngagement], { types: null, daysBack: 30 });
    expect(result).toHaveLength(1);
  });

  it("returns empty for no matches", () => {
    const result = filterEngagements(engagements, { types: ["call"], daysBack: 3 });
    expect(result).toHaveLength(0);
  });
});
