import { describe, it, expect } from "vitest";
import { getHealthTrend, type HealthTrend } from "./health-score";

describe("getHealthTrend", () => {
  it("returns improving when score increases", () => {
    const result = getHealthTrend("75", "45");
    expect(result).toEqual({ direction: "improving", previous: "45" });
  });

  it("returns declining when score decreases", () => {
    const result = getHealthTrend("42", "85");
    expect(result).toEqual({ direction: "declining", previous: "85" });
  });

  it("returns null when no previous score", () => {
    expect(getHealthTrend("85", undefined)).toBeNull();
  });

  it("returns null when scores are the same", () => {
    expect(getHealthTrend("65", "65")).toBeNull();
  });

  it("returns declining when score drops below threshold", () => {
    const result = getHealthTrend("28", "45");
    expect(result).toEqual({ direction: "declining", previous: "45" });
  });

  it("handles full recovery", () => {
    const result = getHealthTrend("90", "20");
    expect(result).toEqual({ direction: "improving", previous: "20" });
  });
});
