import { describe, it, expect, vi } from "vitest";

// search-llm.ts instantiates `new Anthropic()` at module load, which throws
// without ANTHROPIC_API_KEY. The prompt body never touches the SDK; mock the
// constructor so import succeeds in the test environment.
vi.mock("@anthropic-ai/sdk", () => {
  function MockAnthropic() {
    return { messages: { create: vi.fn() } };
  }
  return { default: MockAnthropic };
});

import { _buildPromptForTest as buildPrompt } from "./search-llm";

describe("buildPrompt (Lookup)", () => {
  const filter = { kind: "all" } as const;

  it("scopes Spain by company country, with the reps only for deal-only queries", () => {
    const p = buildPrompt("anything", { kind: "region", region: "ES" }, null);
    expect(p).toContain(`{"propertyName":"understory_company_country","operator":"EQ","value":"ES"}`);
    expect(p).toMatch(/for a deal-only query, scope by the region's owners/);
  });

  it("keeps the owner-scoped regions on owner wording", () => {
    const p = buildPrompt("anything", { kind: "region", region: "DK" }, null);
    expect(p).toMatch(/Active filter: region = DK \(ownerIds \[/);
    expect(p).not.toMatch(/scoped by company country/);
  });

  it("includes the country ISO-code rule and table", () => {
    const p = buildPrompt("anything", filter, null);
    expect(p).toMatch(/two-letter ISO code/);
    expect(p).toMatch(/DK→Denmark/);
    expect(p).toMatch(/SE→Sweden/);
  });

  it("includes Unwilling for pay status", () => {
    const p = buildPrompt("anything", filter, null);
    expect(p).toContain("Unwilling");
  });

  it('Example 2 emits the ISO code "DK", not "Denmark"', () => {
    const p = buildPrompt("anything", filter, null);
    expect(p).toMatch(/Companies in DK with health score below 50/);
    expect(p).toMatch(/"value":"DK"/);
  });
});
