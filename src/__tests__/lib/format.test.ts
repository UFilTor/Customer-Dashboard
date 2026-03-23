import { describe, it, expect } from "vitest";
import { formatValue } from "@/lib/format";

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

  it("returns invoiceStatus as-is (styling handled in component)", () => {
    expect(formatValue("Overdue", "invoiceStatus")).toBe("Overdue");
  });
});
