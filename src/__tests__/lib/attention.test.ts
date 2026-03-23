import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
  process.env.HUBSPOT_LIFECYCLE_PIPELINE_ID = "pipeline-123";
});

import { fetchOverdueInvoices, fetchOverdueTasks, fetchHealthScoreIssues, fetchGoneQuiet } from "@/lib/attention";

describe("fetchOverdueInvoices", () => {
  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchOverdueInvoices();
    expect(result).toEqual([]);
  });

  it("returns empty array when no deals match", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const result = await fetchOverdueInvoices();
    expect(result).toEqual([]);
  });
});

describe("fetchOverdueTasks", () => {
  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchOverdueTasks();
    expect(result).toEqual([]);
  });

  it("returns empty array when no tasks match", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const result = await fetchOverdueTasks();
    expect(result).toEqual([]);
  });
});

describe("fetchHealthScoreIssues", () => {
  it("returns companies with At Risk or Critical Churn Risk scores", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: "c1", properties: { name: "Acme Co", "Health Score Category": "At Risk" } },
          { id: "c2", properties: { name: "Beta Inc", "Health Score Category": "Critical Churn Risk" } },
        ],
      }),
    });

    const result = await fetchHealthScoreIssues();
    expect(result).toEqual([
      { id: "c1", name: "Acme Co", detail: "At Risk" },
      { id: "c2", name: "Beta Inc", detail: "Critical Churn Risk" },
    ]);
  });

  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchHealthScoreIssues();
    expect(result).toEqual([]);
  });
});

describe("fetchGoneQuiet", () => {
  it("returns companies not contacted in 45+ days with days count", async () => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: "c3", properties: { name: "Gamma Ltd", notes_last_contacted: sixtyDaysAgo.toISOString() } },
        ],
      }),
    });

    const result = await fetchGoneQuiet();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("c3");
    expect(result[0].name).toBe("Gamma Ltd");
    expect(result[0].detail).toContain("days ago");
  });
});
