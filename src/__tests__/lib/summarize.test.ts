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

import { generateRecap } from "@/lib/summarize";
import type { Engagement } from "@/lib/types";

const { __mockCreate: mockCreate } = await import("@anthropic-ai/sdk") as { __mockCreate: ReturnType<typeof vi.fn> };

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
          suggestedAction: { text: "Send demo docs", type: "task" },
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
      suggestedAction: { text: "Send demo docs", type: "task" },
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
