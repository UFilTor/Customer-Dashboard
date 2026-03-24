import { describe, it, expect, vi, afterEach } from "vitest";
import { formatGroupDuration } from "./timeline";

describe("formatGroupDuration", () => {
  const now = new Date("2026-03-24T12:00:00Z").getTime();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'new today' for less than 24 hours", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const tenHoursAgo = new Date(now - 10 * 3600000).toISOString();
    expect(formatGroupDuration(tenHoursAgo)).toBe("new today");
  });

  it("returns 'in group 1d' for 1 day", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const oneDayAgo = new Date(now - 86400000).toISOString();
    expect(formatGroupDuration(oneDayAgo)).toBe("in group 1d");
  });

  it("returns 'in group 15d' for 15 days", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fifteenDaysAgo = new Date(now - 15 * 86400000).toISOString();
    expect(formatGroupDuration(fifteenDaysAgo)).toBe("in group 15d");
  });

  it("returns 'in group 1mo' for 30+ days", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const thirtyFiveDaysAgo = new Date(now - 35 * 86400000).toISOString();
    expect(formatGroupDuration(thirtyFiveDaysAgo)).toBe("in group 1mo");
  });

  it("returns 'in group 2mo' for 60+ days", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const sixtyFiveDaysAgo = new Date(now - 65 * 86400000).toISOString();
    expect(formatGroupDuration(sixtyFiveDaysAgo)).toBe("in group 2mo");
  });

  it("returns null for undefined input", () => {
    expect(formatGroupDuration(undefined)).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(formatGroupDuration("not-a-date")).toBeNull();
  });
});
