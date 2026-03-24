import { describe, it, expect } from "vitest";
import {
  getHealthTrend,
  getHealthLabel,
  getHealthColor,
  type HealthTrend,
} from "./health-score";

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

describe("getHealthLabel", () => {
  it("returns Healthy for scores >= 80", () => {
    expect(getHealthLabel("80")).toBe("Healthy");
    expect(getHealthLabel("100")).toBe("Healthy");
  });
  it("returns Monitor for scores 60-79", () => {
    expect(getHealthLabel("60")).toBe("Monitor");
    expect(getHealthLabel("79")).toBe("Monitor");
  });
  it("returns At Risk for scores 40-59", () => {
    expect(getHealthLabel("40")).toBe("At Risk");
    expect(getHealthLabel("59")).toBe("At Risk");
  });
  it("returns Critical Churn Risk for scores < 40", () => {
    expect(getHealthLabel("39")).toBe("Critical Churn Risk");
    expect(getHealthLabel("0")).toBe("Critical Churn Risk");
  });
  it("returns input string for non-numeric values", () => {
    expect(getHealthLabel("N/A")).toBe("N/A");
  });
});

describe("getHealthColor", () => {
  it("returns green for healthy", () => {
    expect(getHealthColor("80")).toEqual({ bg: "#D1FAE5", text: "#065F46" });
  });
  it("returns red for critical", () => {
    expect(getHealthColor("20")).toEqual({ bg: "#FEE2E2", text: "#991B1B" });
  });
});
