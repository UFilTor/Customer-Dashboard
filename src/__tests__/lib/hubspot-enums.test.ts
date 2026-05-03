import { describe, it, expect } from "vitest";
import {
  COUNTRY_CODES,
  KNOWN_VALUES,
  closestMatch,
  humaniseValue,
} from "@/lib/hubspot-enums";

describe("COUNTRY_CODES", () => {
  it("maps ISO codes to friendly names", () => {
    expect(COUNTRY_CODES.DK).toBe("Denmark");
    expect(COUNTRY_CODES.SE).toBe("Sweden");
    expect(COUNTRY_CODES.IT).toBe("Italy");
  });
});

describe("KNOWN_VALUES", () => {
  it("uses ISO codes for country (matches HubSpot's actual storage)", () => {
    expect(KNOWN_VALUES.understory_company_country).toContain("DK");
    expect(KNOWN_VALUES.understory_company_country).not.toContain("Denmark");
  });

  it("includes Unwilling for pay status", () => {
    expect(KNOWN_VALUES.understory_pay_status__customer).toContain("Unwilling");
  });

  it("has non-empty arrays for every declared property", () => {
    for (const [prop, vals] of Object.entries(KNOWN_VALUES)) {
      expect(vals.length, `${prop} should have values`).toBeGreaterThan(0);
    }
  });
});

describe("closestMatch", () => {
  it("special-cases country names → ISO codes", () => {
    const out = closestMatch(
      "Denmark",
      KNOWN_VALUES.understory_company_country,
      5,
      "understory_company_country",
    );
    expect(out[0]).toBe("DK");
  });

  it("special-cases country names case-insensitively", () => {
    const out = closestMatch(
      "denmark",
      KNOWN_VALUES.understory_company_country,
      5,
      "understory_company_country",
    );
    expect(out[0]).toBe("DK");
  });

  it("ranks prefix matches above pure edit distance", () => {
    const out = closestMatch("Liv", ["Live", "Verified", "Ineligible"], 3);
    expect(out[0]).toBe("Live");
  });

  it("returns up to topN candidates", () => {
    const out = closestMatch("xyz", ["a", "b", "c", "d", "e", "f"], 3);
    expect(out.length).toBe(3);
  });

  it("handles empty candidates without throwing", () => {
    expect(closestMatch("anything", [])).toEqual([]);
  });
});

describe("humaniseValue", () => {
  it("expands country ISO codes to Name (CODE)", () => {
    expect(humaniseValue("understory_company_country", "DK")).toBe("Denmark (DK)");
  });

  it("returns the raw value for non-country properties", () => {
    expect(humaniseValue("customer_stage", "Started")).toBe("Started");
  });

  it("returns the raw value for unknown country codes", () => {
    expect(humaniseValue("understory_company_country", "ZZ")).toBe("ZZ");
  });
});
