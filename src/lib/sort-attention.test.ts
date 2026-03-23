import { describe, it, expect } from "vitest";
import { sortAttentionCompanies } from "./sort-attention";
import type { AttentionCompany } from "./types";

const makeCompany = (
  overrides: Partial<AttentionCompany>
): AttentionCompany => ({
  id: "1",
  name: "Test Co",
  detail: "",
  ownerId: "owner1",
  mrr: "0",
  currency: "EUR",
  daysOverdue: 0,
  daysSilent: 0,
  ...overrides,
});

describe("sortAttentionCompanies", () => {
  it("sorts by MRR descending by default", () => {
    const companies = [
      makeCompany({ id: "a", name: "Low", mrr: "500" }),
      makeCompany({ id: "b", name: "High", mrr: "2000" }),
      makeCompany({ id: "c", name: "Mid", mrr: "1200" }),
    ];
    const sorted = sortAttentionCompanies(companies, "mrr");
    expect(sorted.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by daysOverdue descending", () => {
    const companies = [
      makeCompany({ id: "a", name: "A", daysOverdue: 5 }),
      makeCompany({ id: "b", name: "B", daysOverdue: 30 }),
      makeCompany({ id: "c", name: "C", daysOverdue: 12 }),
    ];
    const sorted = sortAttentionCompanies(companies, "daysOverdue");
    expect(sorted.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by daysSilent descending", () => {
    const companies = [
      makeCompany({ id: "a", name: "A", daysSilent: 10 }),
      makeCompany({ id: "b", name: "B", daysSilent: 45 }),
    ];
    const sorted = sortAttentionCompanies(companies, "daysSilent");
    expect(sorted.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("breaks ties alphabetically by name", () => {
    const companies = [
      makeCompany({ id: "a", name: "Zebra Tours", mrr: "1000" }),
      makeCompany({ id: "b", name: "Alpha Workshops", mrr: "1000" }),
    ];
    const sorted = sortAttentionCompanies(companies, "mrr");
    expect(sorted.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("handles MRR with currency formatting", () => {
    const companies = [
      makeCompany({ id: "a", name: "A", mrr: "1 500" }),
      makeCompany({ id: "b", name: "B", mrr: "800" }),
    ];
    const sorted = sortAttentionCompanies(companies, "mrr");
    expect(sorted.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("sorts MRR with currency conversion (EUR > SEK at same numeric value)", () => {
    const companies = [
      makeCompany({ id: "a", name: "A", mrr: "3800", currency: "SEK" }),
      makeCompany({ id: "b", name: "B", mrr: "950", currency: "EUR" }),
    ];
    const sorted = sortAttentionCompanies(companies, "mrr");
    // 950 EUR (~950) > 3800 SEK (~330 EUR)
    expect(sorted.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("returns empty array for empty input", () => {
    expect(sortAttentionCompanies([], "mrr")).toEqual([]);
  });
});
