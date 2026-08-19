import { describe, it, expect } from "vitest";
import { classifyPortfolioStage } from "./portfolio";

const RETENTION = "1072518362";
const LIFECYCLE = "166333631";
const RAMP_UP_COL = "3460322544";
const ESTABLISHED_COL = "1486762226";
const CHURNED_COL = "1692266738";

describe("classifyPortfolioStage", () => {
  it("maps customer_stage internal values to portfolio stages", () => {
    expect(classifyPortfolioStage("Live", RETENTION)).toBe("Started");
    expect(classifyPortfolioStage("Adoption", RETENTION)).toBe("Adopted");
    expect(classifyPortfolioStage("Ramp Up", RETENTION)).toBe("Ramp Up");
    expect(classifyPortfolioStage("Onboarding", LIFECYCLE)).toBe("Onboarding");
  });

  it("lets the retention board column promote a lagging customer_stage", () => {
    // The Lalandia Billund case: column says Ramp Up, property still "Live".
    expect(classifyPortfolioStage("Live", RETENTION, null, RAMP_UP_COL)).toBe("Ramp Up");
    expect(classifyPortfolioStage("Ramp Up", RETENTION, null, ESTABLISHED_COL)).toBe("Established");
  });

  it("never demotes: customer_stage wins when it is further along", () => {
    expect(classifyPortfolioStage("Established", RETENTION, null, RAMP_UP_COL)).toBe("Established");
  });

  it("column floor rescues unrecognised overlay values like Paused", () => {
    // "Paused" falls through to the pipeline fallback (Adopted); the column
    // floor lifts it back to where the board says it is.
    expect(classifyPortfolioStage("Paused", RETENTION, null, RAMP_UP_COL)).toBe("Ramp Up");
    expect(classifyPortfolioStage("Paused", RETENTION, null, ESTABLISHED_COL)).toBe("Established");
  });

  it("ignores unmapped columns and other pipelines", () => {
    expect(classifyPortfolioStage("Live", RETENTION, null, CHURNED_COL)).toBe("Started");
    expect(classifyPortfolioStage("Live", LIFECYCLE, null, RAMP_UP_COL)).toBe("Started");
    expect(classifyPortfolioStage("Live", RETENTION, null, null)).toBe("Started");
  });
});
