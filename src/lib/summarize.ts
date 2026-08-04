import Anthropic from "@anthropic-ai/sdk";
import { HAIKU_MODEL } from "./llm";
import { Engagement, Recap, OwnerMap, StageMap, SinceLastTouch, WatchOutSignal } from "./types";

const client = new Anthropic();

/**
 * Structured account state fed into the recap prompt so the summary is
 * grounded in what the dashboard already knows (signals, health, invoices,
 * recent changes) instead of only the conversation history.
 */
export interface RecapAccountState {
  signals: WatchOutSignal[];
  sinceLastTouch: SinceLastTouch | null;
}

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
          model: HAIKU_MODEL,
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

/** Pure prompt assembly — exported for tests. */
export function buildRecapPrompt(
  engagements: Engagement[],
  company: Record<string, string>,
  deal: Record<string, string> | null,
  owners: OwnerMap,
  stages: StageMap,
  accountState?: RecapAccountState | null
): string {
  // Calendar-synced meetings can carry FUTURE timestamps (a booked meeting
  // lands as an engagement before it happens). Tag those so the model doesn't
  // describe them in past tense ("a meeting occurred on August 4th").
  const now = Date.now();
  const todayStr = new Date().toLocaleDateString("sv-SE");
  const activitySummary = engagements
    .slice(0, 10)
    .map((e) => {
      const date = new Date(e.timestamp);
      const dateStr = isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString("sv-SE");
      const isUpcoming = !isNaN(date.getTime()) && date.getTime() > now;
      const tag = isUpcoming ? `UPCOMING ${e.type.toUpperCase()} (scheduled, has not happened yet)` : e.type.toUpperCase();
      const ownerName = e.owner ? (owners[e.owner] || e.owner) : "";
      const bodyText = stripHtml(e.body).slice(0, 500);
      return `[${tag}] ${dateStr} - ${e.title}${ownerName ? ` (${ownerName})` : ""}\n${bodyText}`;
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
    (parseInt(deal?.understory_number_of_unpaid_invoices || "0", 10) || 0) > 0 ? "Invoice: Unpaid" : "",
  ].filter(Boolean).join("\n");

  // ACCOUNT STATE block: watch-out signals + property changes since the last
  // touch. Only rendered when there is something to say.
  const stateLines: string[] = [];
  if (accountState) {
    for (const s of accountState.signals) {
      stateLines.push(`- [${s.severity.toUpperCase()}] ${s.title}${s.detail ? `: ${s.detail}` : ""}`);
    }
    const slt = accountState.sinceLastTouch;
    if (slt && slt.changes.length > 0) {
      const days = slt.daysSinceTouch != null ? `${slt.daysSinceTouch} days ago` : "unknown date";
      stateLines.push(`- Changes since last meeting or call (${days}):`);
      for (const c of slt.changes) {
        if (c.from == null) {
          stateLines.push(`  - ${c.label}: now ${c.to}`);
          continue;
        }
        // Health score direction isn't self-evident from two bare numbers,
        // and the model has been observed inferring the wrong one (e.g.
        // reading 41 -> 49 as "dropping to 49") and contradicting the exact
        // figures it was just given. Say the direction outright.
        if (c.field === "health_score") {
          const from = parseFloat(c.from);
          const to = parseFloat(c.to);
          const direction = Number.isFinite(from) && Number.isFinite(to)
            ? to > from ? `IMPROVED by ${to - from}` : to < from ? `DECLINED by ${from - to}` : "unchanged"
            : null;
          stateLines.push(
            `  - ${c.label}: ${c.from} -> ${c.to}${direction ? ` (${direction})` : ""}`
          );
          continue;
        }
        stateLines.push(`  - ${c.label}: ${c.from} -> ${c.to}`);
      }
    }
  }
  const stateBlock = stateLines.length > 0
    ? `\n\nACCOUNT STATE (facts from the dashboard - ground your summary and suggestion in these, do not invent or contradict them. Where a score change is marked IMPROVED/DECLINED/unchanged, use that exact direction - never state or imply the opposite):\n${stateLines.join("\n")}`
    : "";

  return `You are analyzing a customer's recent activity for a CS team dashboard. Today's date is ${todayStr}. Based on the activity history and company context below, generate:

1. A summary (3-5 sentences): What was last discussed, any commitments or promises made, outstanding follow-ups, and how the relationship is trending.

Writing rules:
- Entries tagged UPCOMING are scheduled and have NOT happened yet. Refer to them in future tense ("a meeting is scheduled for ..."), never as something that occurred.
- Always write times in 24-hour format (e.g. 11:00, 14:30). Never use AM/PM, even when the source notes do.
2. A suggested next action: A specific, actionable recommendation. Include an action type: "note", "task", "meeting", or "call".
3. A confidence level for the suggested action: "low", "medium", or "high".
   - high: clear signal in the activity history (a recent commitment, an explicit follow-up, an unresolved problem with a deadline).
   - medium: a reasonable inference but not directly stated in the activity.
   - low: no recent or relevant activity, you are guessing, the data is sparse, or the suggestion is generic.

Respond with ONLY valid JSON in this exact format:
{"summary": "...", "suggestedAction": {"text": "...", "type": "note|task|meeting|call", "confidence": "low|medium|high"}}

COMPANY CONTEXT:
${context}

RECENT ACTIVITY (newest first):
${activitySummary}${stateBlock}`;
}

export async function generateRecap(
  engagements: Engagement[],
  company: Record<string, string>,
  deal: Record<string, string> | null,
  owners: OwnerMap,
  stages: StageMap,
  accountState?: RecapAccountState | null
): Promise<Recap | null> {
  if (engagements.length === 0) return null;

  try {
    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: buildRecapPrompt(engagements, company, deal, owners, stages, accountState),
        },
      ],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      return { summary: null, suggestedAction: null, error: true };
    }

    // Strip markdown code block wrapper if present (```json ... ```)
    const cleanText = block.text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const parsed = JSON.parse(cleanText);
    if (!parsed.summary || !parsed.suggestedAction?.text || !parsed.suggestedAction?.type) {
      return { summary: null, suggestedAction: null, error: true };
    }
    const rawConf = parsed.suggestedAction.confidence;
    const confidence = rawConf === "high" || rawConf === "medium" || rawConf === "low" ? rawConf : "medium";

    return {
      summary: parsed.summary,
      suggestedAction: {
        text: parsed.suggestedAction.text,
        type: parsed.suggestedAction.type,
        confidence,
      },
    };
  } catch (err) {
    console.error("Failed to generate recap:", err instanceof Error ? err.message : err);
    return { summary: null, suggestedAction: null, error: true };
  }
}
