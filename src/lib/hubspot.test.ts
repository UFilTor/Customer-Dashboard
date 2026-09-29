import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCompanies, getOwners, pickLifecycleDeal } from "./hubspot";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
});

describe("searchCompanies", () => {
  it("calls HubSpot search API with company name filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: "123", properties: { name: "Acme Adventures", domain: "acme.se" } },
        ],
      }),
    });

    const results = await searchCompanies("Acme");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/companies/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
    expect(results).toEqual([
      { id: "123", name: "Acme Adventures", domain: "acme.se" },
    ]);
  });

  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const results = await searchCompanies("Acme");
    expect(results).toEqual([]);
  });
});

describe("getOwners", () => {
  it("returns owner id-to-name map", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: "1", firstName: "Filip", lastName: "K." },
          { id: "2", firstName: "Anna", lastName: "S." },
        ],
      }),
    });

    const owners = await getOwners();
    expect(owners).toEqual({ "1": "Filip K.", "2": "Anna S." });
  });
});

const LIFECYCLE = "166333631";
const deal = (id: string, pipeline: string, open?: string) => ({
  id,
  properties: { pipeline, ...(open !== undefined ? { is_open_lifecycle_deal: open } : {}) },
});

describe("pickLifecycleDeal", () => {
  it("prefers the open lifecycle deal over an earlier churned one", () => {
    const picked = pickLifecycleDeal(
      [deal("sales", "81267902"), deal("old", LIFECYCLE, "0"), deal("current", LIFECYCLE, "1")],
      [LIFECYCLE]
    );
    expect(picked?.id).toBe("current");
  });

  it("falls back to the first lifecycle deal when none is marked open", () => {
    expect(pickLifecycleDeal([deal("a", LIFECYCLE), deal("b", LIFECYCLE)], [LIFECYCLE])?.id).toBe("a");
  });

  it("ignores an open flag on a deal outside the lifecycle pipelines, and handles no match", () => {
    expect(pickLifecycleDeal([deal("x", "3687958771", "1"), deal("l", LIFECYCLE, "0")], [LIFECYCLE])?.id).toBe("l");
    expect(pickLifecycleDeal([deal("s", "81267902")], [LIFECYCLE])).toBeUndefined();
    expect(pickLifecycleDeal([], [LIFECYCLE])).toBeUndefined();
  });
});
