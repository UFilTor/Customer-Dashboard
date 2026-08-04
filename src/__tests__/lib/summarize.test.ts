import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }
  return {
    default: MockAnthropic,
    __mockCreate: mockCreate,
  };
});

import { buildRecapPrompt, generateRecap } from "@/lib/summarize";
import type { Engagement } from "@/lib/types";

const { __mockCreate: mockCreate } = await import("@anthropic-ai/sdk") as unknown as { __mockCreate: ReturnType<typeof vi.fn> };

const mockEngagement: Engagement = {
  type: "call",
  title: "Quarterly check-in",
  body: "Discussed upcoming season",
  bodyPreview: "Discussed upcoming season",
  summary: "Customer expects growth and wants group booking demo.",
  timestamp: String(Date.now()),
  direction: "OUTBOUND",
};

describe("generateRecap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no engagements provided", async () => {
    const result = await generateRecap([], {}, null, {}, {});
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns recap with summary and suggested action on success", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: "text",
        text: JSON.stringify({
          summary: "Last call discussed growth plans.",
          suggestedAction: { text: "Send demo docs", type: "task", confidence: "high" },
        }),
      }],
    });

    const result = await generateRecap(
      [mockEngagement],
      { name: "Acme", confirmed__contract_mrr: "2400" },
      { dealname: "Acme Pro", dealstage: "Active" },
      { "1": "Filip K." },
      { "123": "Active Customer" }
    );

    expect(result).toEqual({
      summary: "Last call discussed growth plans.",
      suggestedAction: { text: "Send demo docs", type: "task", confidence: "high" },
    });
  });

  it("returns error recap when AI call fails", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API error"));

    const result = await generateRecap(
      [mockEngagement],
      { name: "Acme" },
      null,
      {},
      {}
    );

    expect(result).toEqual({
      summary: null,
      suggestedAction: null,
      error: true,
    });
  });

  it("returns error recap when AI returns invalid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not valid json" }],
    });

    const result = await generateRecap(
      [mockEngagement],
      { name: "Acme" },
      null,
      {},
      {}
    );

    expect(result).toEqual({
      summary: null,
      suggestedAction: null,
      error: true,
    });
  });
});

describe("buildRecapPrompt", () => {
  it("omits the ACCOUNT STATE block when no state is provided", () => {
    const prompt = buildRecapPrompt([mockEngagement], { name: "Acme" }, null, {}, {});
    expect(prompt).not.toContain("ACCOUNT STATE");
    expect(prompt).toContain("RECENT ACTIVITY");
  });

  it("renders signals and since-last-touch changes in the ACCOUNT STATE block", () => {
    const prompt = buildRecapPrompt([mockEngagement], { name: "Acme" }, null, {}, {}, {
      signals: [
        { kind: "overdue_invoice", severity: "bad", title: "Overdue invoice", detail: "2,140 EUR" },
      ],
      sinceLastTouch: {
        lastTouch: "2026-07-20T10:00:00.000Z",
        daysSinceTouch: 14,
        changes: [
          {
            field: "health_score",
            label: "Health score",
            from: "72",
            to: "58",
            timestamp: "2026-07-28T00:00:00.000Z",
          },
        ],
      },
    });
    expect(prompt).toContain("ACCOUNT STATE");
    expect(prompt).toContain("[BAD] Overdue invoice: 2,140 EUR");
    expect(prompt).toContain("Health score: 72 -> 58");
    expect(prompt).toContain("14 days ago");
  });

  it("tags future-dated engagements as UPCOMING and includes the tense/time rules", () => {
    const future: Engagement = {
      ...mockEngagement,
      type: "meeting",
      title: "Implementation call",
      timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    const prompt = buildRecapPrompt([future, mockEngagement], { name: "Acme" }, null, {}, {});
    expect(prompt).toContain("UPCOMING MEETING (scheduled, has not happened yet)");
    expect(prompt).toContain("24-hour format");
    expect(prompt).toContain("Never use AM/PM");
    // The past engagement keeps its plain tag
    expect(prompt).toContain("[CALL]");
  });

  it("omits the block when state is present but empty", () => {
    const prompt = buildRecapPrompt([mockEngagement], { name: "Acme" }, null, {}, {}, {
      signals: [],
      sinceLastTouch: null,
    });
    expect(prompt).not.toContain("ACCOUNT STATE");
  });
});
