import Anthropic from "@anthropic-ai/sdk";
import { Engagement, Recap, OwnerMap, StageMap } from "./types";

const client = new Anthropic();

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

export async function summarizeEngagements(engagements: Engagement[]): Promise<Engagement[]> {
  const toSummarize = engagements
    .filter((e) => {
      const text = stripHtml(e.body);
      return text.length > 50;
    })
    .slice(0, 10); // Only summarize the 10 most recent to avoid rate limits

  if (toSummarize.length === 0) return engagements;

  // Process in batches of 3 to avoid rate limits
  const summaries: string[] = [];
  for (let i = 0; i < toSummarize.length; i += 3) {
    const batch = toSummarize.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(async (e) => {
      try {
        const text = stripHtml(e.body);
        const response = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [
            {
              role: "user",
              content: `Summarize this ${e.type} in 2-4 sentences. Focus on key takeaways, decisions made, and action items. Be specific and direct.\n\nTitle: ${e.title}\nContent:\n${text.slice(0, 2000)}`,
            },
          ],
        });
        const block = response.content[0];
        return block.type === "text" ? block.text : "";
      } catch {
        return "";
      }
    })
    );
    summaries.push(...batchResults);
  }

  const summaryMap = new Map<Engagement, string>();
  toSummarize.forEach((e, i) => summaryMap.set(e, summaries[i]));

  return engagements.map((e) => ({
    ...e,
    summary: summaryMap.get(e) || "",
  }));
}

export async function generateRecap(
  engagements: Engagement[],
  company: Record<string, string>,
  deal: Record<string, string> | null,
  owners: OwnerMap,
  stages: StageMap
): Promise<Recap | null> {
  if (engagements.length === 0) return null;

  const activitySummary = engagements
    .slice(0, 10)
    .map((e) => {
      const date = new Date(e.timestamp);
      const dateStr = isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString("sv-SE");
      const ownerName = e.owner ? (owners[e.owner] || e.owner) : "";
      return `[${e.type.toUpperCase()}] ${dateStr} - ${e.title}${ownerName ? ` (${ownerName})` : ""}\nSummary: ${e.summary || stripHtml(e.body).slice(0, 200)}`;
    })
    .join("\n\n");

  const dealStage = deal?.dealstage ? (stages[deal.dealstage] || deal.dealstage) : "Unknown";

  const context = [
    `Company: ${company.name || "Unknown"}`,
    `MRR: ${deal?.confirmed__contract_mrr || "Unknown"}`,
    `Health Score: ${company["health_score"] || "Unknown"}`,
    `Last contacted: ${company.notes_last_contacted || "Unknown"}`,
    deal ? `Deal: ${deal.dealname || "Unknown"} (Stage: ${dealStage})` : "No active deal",
    deal?.booking_fee ? `Booking fee: ${(parseFloat(deal.booking_fee) * 100).toFixed(2).replace(/\.?0+$/, "")}%` : "",
    deal?.understory_pay_status__customer ? `Understory Pay: ${deal.understory_pay_status__customer}` : "",
    deal?.unpaid_invoice === "true" ? "Invoice: Overdue" : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are analyzing a customer's recent activity for a CS team dashboard. Based on the activity history and company context below, generate:

1. A summary (3-5 sentences): What was last discussed, any commitments or promises made, outstanding follow-ups, and how the relationship is trending.
2. A suggested next action: A specific, actionable recommendation. Include an action type: "note", "task", "meeting", or "call".

Respond with ONLY valid JSON in this exact format:
{"summary": "...", "suggestedAction": {"text": "...", "type": "note|task|meeting|call"}}

COMPANY CONTEXT:
${context}

RECENT ACTIVITY (newest first):
${activitySummary}`,
        },
      ],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      return { summary: null, suggestedAction: null, error: true };
    }

    const parsed = JSON.parse(block.text);
    if (!parsed.summary || !parsed.suggestedAction?.text || !parsed.suggestedAction?.type) {
      return { summary: null, suggestedAction: null, error: true };
    }

    return {
      summary: parsed.summary,
      suggestedAction: {
        text: parsed.suggestedAction.text,
        type: parsed.suggestedAction.type,
      },
    };
  } catch {
    console.error("Failed to generate recap");
    return { summary: null, suggestedAction: null, error: true };
  }
}
