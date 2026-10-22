import { describe, it, expect } from "vitest";
import { fmtHealth } from "./format-design";

describe("fmtHealth", () => {
  it("reads a whole-number score of 1 as 1, not as a 100% ratio", () => {
    expect(fmtHealth(1)).toEqual({ label: "Weak", num: 1, tone: "bad" });
    expect(fmtHealth("1")).toEqual({ label: "Weak", num: 1, tone: "bad" });
  });

  it("reads 0 and ordinary 0-100 scores as they are", () => {
    expect(fmtHealth(0)).toEqual({ label: "Weak", num: 0, tone: "bad" });
    expect(fmtHealth("55")).toEqual({ label: "At risk", num: 55, tone: "warn" });
    expect(fmtHealth(100)).toEqual({ label: "Strong", num: 100, tone: "good" });
  });

  it("still scales legacy fractional ratios to 0-100", () => {
    expect(fmtHealth(0.45)).toEqual({ label: "At risk", num: 45, tone: "warn" });
    expect(fmtHealth("0.9")).toEqual({ label: "Strong", num: 90, tone: "good" });
  });

  it("shows a dash for a blank or unparseable score", () => {
    expect(fmtHealth(null).num).toBeNull();
    expect(fmtHealth("").num).toBeNull();
    expect(fmtHealth("abc").num).toBeNull();
  });
});
