import { describe, it, expect } from "vitest";
import { abbreviateEur, computeVolumeTrend, formatValue } from "./format";

describe("abbreviateEur", () => {
  it("returns '-' for zero or undefined", () => {
    expect(abbreviateEur(0)).toBe("-");
    expect(abbreviateEur(undefined)).toBe("-");
  });
  it("shows raw number below 1000", () => {
    expect(abbreviateEur(800)).toBe("€800");
  });
  it("abbreviates thousands as k", () => {
    expect(abbreviateEur(186000)).toBe("€186k");
    expect(abbreviateEur(1500)).toBe("€2k");
  });
  it("abbreviates millions as M with one decimal", () => {
    expect(abbreviateEur(1200000)).toBe("€1.2M");
    expect(abbreviateEur(999500)).toBe("€1.0M");
  });
  it("drops .0 on clean millions", () => {
    expect(abbreviateEur(2000000)).toBe("€2M");
  });
});

describe("computeVolumeTrend", () => {
  it("returns null when volume6m is missing", () => {
    expect(computeVolumeTrend(100, undefined)).toBeNull();
  });
  it("returns null when previous period is zero", () => {
    expect(computeVolumeTrend(5000, 5000)).toBeNull();
  });
  it("returns null when previous period is negative", () => {
    expect(computeVolumeTrend(6000, 5000)).toBeNull();
  });
  it("computes positive trend", () => {
    expect(computeVolumeTrend(6000, 10000)).toEqual({ direction: "up", percent: 50 });
  });
  it("computes negative trend", () => {
    expect(computeVolumeTrend(3000, 10000)).toEqual({ direction: "down", percent: 57 });
  });
  it("computes flat trend", () => {
    expect(computeVolumeTrend(5000, 10000)).toEqual({ direction: "flat", percent: 0 });
  });
});


describe("formatValue", () => {
  it("formats currency with EUR as default", () => {
    expect(formatValue("2400", "currency")).toBe("\u20ac2 400");
  });

  it("formats currency with specific currency code", () => {
    expect(formatValue("2400", "currency", "SEK")).toBe("SEK 2 400");
    expect(formatValue("2400", "currency", "DKK")).toBe("DKK 2 400");
    expect(formatValue("2400", "currency", "NOK")).toBe("NOK 2 400");
    expect(formatValue("2400", "currency", "EUR")).toBe("\u20ac2 400");
  });

  it("formats null/undefined as dash", () => {
    expect(formatValue(null, "currency")).toBe("-");
    expect(formatValue(undefined, "text")).toBe("-");
    expect(formatValue("", "number")).toBe("-");
  });

  it("formats numbers with space separators", () => {
    expect(formatValue("186000", "number")).toBe("186 000");
  });

  it("formats percentages", () => {
    expect(formatValue("3.5", "percentage")).toBe("3.5%");
  });

  it("formats dates as YYYY-MM-DD", () => {
    expect(formatValue("2026-03-21T10:00:00Z", "date")).toBe("2026-03-21");
  });

  it("returns text as-is", () => {
    expect(formatValue("Active", "text")).toBe("Active");
  });

  it("returns link as-is", () => {
    expect(formatValue("example.com", "link")).toBe("example.com");
  });

  it("returns badge as-is", () => {
    expect(formatValue("Active Customer", "badge")).toBe("Active Customer");
  });

  it("returns owner as-is (resolved elsewhere)", () => {
    expect(formatValue("Filip K.", "owner")).toBe("Filip K.");
  });

  it("maps invoiceStatus from the unpaid-invoice count", () => {
    expect(formatValue("0", "invoiceStatus")).toBe("Up to date");
    expect(formatValue(null, "invoiceStatus")).toBe("Up to date");
    expect(formatValue("", "invoiceStatus")).toBe("Up to date");
    expect(formatValue("1", "invoiceStatus")).toBe("1 unpaid");
    expect(formatValue("3", "invoiceStatus")).toBe("3 unpaid");
    // Non-numeric input degrades to the zero state, not a crash.
    expect(formatValue("Overdue", "invoiceStatus")).toBe("Up to date");
  });
});
