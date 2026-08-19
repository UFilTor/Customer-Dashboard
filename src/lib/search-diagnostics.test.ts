import { describe, it, expect, vi } from "vitest";
import { humaniseSpec, buildDiagnostic } from "./search-diagnostics";
import type { SearchSpec } from "./types";

const filipId = "1939229547";

function spec(partial: Partial<SearchSpec>): SearchSpec {
  return {
    targets: [],
    ownerScope: { kind: "all" },
    limit: 100,
    ...partial,
  };
}

describe("humaniseSpec", () => {
  it("renders single-target with country expansion", () => {
    const s = spec({
      targets: [
        {
          entityType: "company",
          filters: [
            { propertyName: "understory_company_country", operator: "EQ", value: "DK" },
            { propertyName: "health_score", operator: "LT", value: "50" },
          ],
          textSearch: null,
        },
      ],
    });
    expect(humaniseSpec(s)).toBe(
      "Searched companies where country = Denmark (DK) and health_score < 50.",
    );
  });

  it("maps owner IDs back to names", () => {
    const s = spec({
      targets: [
        {
          entityType: "deal",
          filters: [
            { propertyName: "hubspot_owner_id", operator: "EQ", value: filipId },
          ],
          textSearch: null,
        },
      ],
    });
    expect(humaniseSpec(s)).toBe("Searched deals owned by Filip.");
  });

  it("formats CONTAINS_TOKEN as 'mentioning'", () => {
    const s = spec({
      targets: [
        {
          entityType: "deal",
          filters: [],
          textSearch: { terms: ["GYG"], fields: ["ob_note___customer_needs_"] },
        },
      ],
    });
    expect(humaniseSpec(s)).toContain('mentioning "GYG"');
  });

  it("joins multi-target with 'and'", () => {
    const s = spec({
      targets: [
        {
          entityType: "call",
          filters: [],
          textSearch: { terms: ["pricing"], fields: ["hs_call_body"] },
        },
        {
          entityType: "meeting",
          filters: [],
          textSearch: { terms: ["pricing"], fields: ["hs_meeting_body"] },
        },
      ],
    });
    const out = humaniseSpec(s);
    expect(out).toContain("calls");
    expect(out).toContain("meetings");
    expect(out).toContain(" and ");
  });
});

describe("buildDiagnostic", () => {
  const blankProbe = vi.fn(async () => 0);

  it("returns specSummary even when there are no filters", async () => {
    const s = spec({
      targets: [{ entityType: "company", filters: [], textSearch: null }],
    });
    const d = await buildDiagnostic(s, blankProbe);
    expect(d.specSummary).toMatch(/^Searched companies/);
    expect(d.filterProbes).toBeUndefined();
    expect(d.didYouMean).toBeUndefined();
  });

  it("runs per-filter probes when total = 0 and 2+ filters", async () => {
    const probe = vi.fn(async (_entity: string, propertyName: string) => {
      if (propertyName === "understory_company_country") return 0;
      if (propertyName === "health_score") return 84;
      return 0;
    });
    const s = spec({
      targets: [
        {
          entityType: "company",
          filters: [
            { propertyName: "understory_company_country", operator: "EQ", value: "Denmark" },
            { propertyName: "health_score", operator: "LT", value: "50" },
          ],
          textSearch: null,
        },
      ],
    });
    const d = await buildDiagnostic(s, probe);
    expect(d.filterProbes).toHaveLength(2);
    const country = d.filterProbes!.find(
      (f) => f.propertyName === "understory_company_country",
    );
    expect(country?.aloneMatched).toBe(0);
    const health = d.filterProbes!.find((f) => f.propertyName === "health_score");
    expect(health?.aloneMatched).toBe(84);
  });

  it("emits didYouMean for failed EQ on a known-values property", async () => {
    const probe = vi.fn(async () => 0);
    const s = spec({
      targets: [
        {
          entityType: "company",
          filters: [
            { propertyName: "understory_company_country", operator: "EQ", value: "Denmark" },
            { propertyName: "health_score", operator: "LT", value: "50" },
          ],
          textSearch: null,
        },
      ],
    });
    const d = await buildDiagnostic(s, probe);
    expect(d.didYouMean).toBeDefined();
    expect(d.didYouMean![0].propertyName).toBe("understory_company_country");
    expect(d.didYouMean![0].suggestions[0]).toBe("DK");
  });

  it("skips per-filter probes when only one filter exists", async () => {
    const probe = vi.fn(async () => 0);
    const s = spec({
      targets: [
        {
          entityType: "company",
          filters: [
            { propertyName: "understory_company_country", operator: "EQ", value: "Spain" },
          ],
          textSearch: null,
        },
      ],
    });
    const d = await buildDiagnostic(s, probe);
    expect(d.filterProbes).toBeUndefined();
    expect(d.didYouMean).toBeDefined();
  });

  it("skips entirely when targets is empty", async () => {
    const probe = vi.fn(async () => 0);
    const d = await buildDiagnostic(spec({}), probe);
    expect(d.specSummary).toBe("");
    expect(probe).not.toHaveBeenCalled();
  });
});
