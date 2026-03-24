import { describe, it, expect } from "vitest";
import { getHealthTrend, type HealthTrend } from "./health-score";

describe("getHealthTrend", () => {
  it("returns improving when moving toward Healthy", () => {
    const result = getHealthTrend("Monitor", "At Risk");
    expect(result).toEqual({ direction: "improving", previous: "At Risk" });
  });

  it("returns declining when moving away from Healthy", () => {
    const result = getHealthTrend("At Risk", "Healthy");
    expect(result).toEqual({ direction: "declining", previous: "Healthy" });
  });

  it("returns null when no previous category", () => {
    expect(getHealthTrend("Healthy", undefined)).toBeNull();
  });

  it("returns null when categories are the same", () => {
    expect(getHealthTrend("Monitor", "Monitor")).toBeNull();
  });

  it("handles Critical Churn Risk correctly", () => {
    const result = getHealthTrend("Critical Churn Risk", "At Risk");
    expect(result).toEqual({ direction: "declining", previous: "At Risk" });
  });

  it("handles full recovery", () => {
    const result = getHealthTrend("Healthy", "Critical Churn Risk");
    expect(result).toEqual({ direction: "improving", previous: "Critical Churn Risk" });
  });
});
