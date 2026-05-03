import { describe, it, expect } from "vitest";
import { classifyPortfolioStage } from "./portfolio";

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
