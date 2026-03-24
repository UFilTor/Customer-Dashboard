import { describe, it, expect } from "vitest";
import { abbreviateEur, computeVolumeTrend } from "./format";

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
