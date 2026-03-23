import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCompanies, getCompanyDetail, getOwners, getDealStages } from "@/lib/hubspot";

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
