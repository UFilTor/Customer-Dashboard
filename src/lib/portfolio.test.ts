import { describe, it, expect } from "vitest";
import { classifyPortfolioStage, isSignalApplicable } from "./portfolio";

describe("classifyPortfolioStage", () => {
  it("maps onboarding-flavored HubSpot values", () => {
    expect(classifyPortfolioStage("Onboarding", null)).toBe("Onboarding");
    expect(classifyPortfolioStage("Adopted", null)).toBe("Adopted");
    expect(classifyPortfolioStage("Started", null)).toBe("Started");
  });

  it("maps retention-flavored HubSpot values", () => {
    expect(classifyPortfolioStage("Ramp Up", null)).toBe("Ramp Up");
    expect(classifyPortfolioStage("Established", null)).toBe("Established");
  });

  it("falls back to Established for unknown stages so the row still appears", () => {
    expect(classifyPortfolioStage("", null)).toBe("Established");
    expect(classifyPortfolioStage("Some Future Stage", null)).toBe("Established");
  });
});

describe("isSignalApplicable", () => {
  it("allows stuck_in_step only on Onboarding/Adopted/Started", () => {
    expect(isSignalApplicable("stuck_in_step", "Onboarding")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Adopted")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Started")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Ramp Up")).toBe(false);
    expect(isSignalApplicable("stuck_in_step", "Established")).toBe(false);
  });

  it("allows volume_declining only on Ramp Up + Established", () => {
    expect(isSignalApplicable("volume_declining", "Onboarding")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Adopted")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Started")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Ramp Up")).toBe(true);
    expect(isSignalApplicable("volume_declining", "Established")).toBe(true);
  });

  it("allows overdue_invoices on every stage", () => {
    for (const stage of ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"] as const) {
      expect(isSignalApplicable("overdue_invoices", stage)).toBe(true);
    }
  });
});
