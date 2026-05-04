import Anthropic from "@anthropic-ai/sdk";
import type { PayDeal } from "./types";

const client = new Anthropic();

// Per-process cache keyed on the reason text. Same reason always yields the
// same classification, so a single warm cache handles every owner-scoped
// rebuild for the duration of the dyno without another LLM round-trip.
const cache = new Map<string, boolean>();

const SYSTEM_PROMPT = `You classify "unwilling-to-migrate" reasons from CS notes for Understory Pay.

Mark q2_likely=true ONLY when the reason reads as a temporary or situational blocker that could plausibly clear during Q2 (April–June). Examples that should be true:
- Waiting on a specific integration (Fortnox, GetYourGuide, Stripe contract end date)
- Wants to see platform stability first
- Customer is on vacation / decision-maker out
- Internal review / accountant approval pending
- Soft objection that depends on a finite event

Mark q2_likely=false when the reason is structural or hard:
- Permanent preference for current PSP, no plans to change
- "Never", "not interested", "switching away from Understory"
- Pricing rejection without any expiration window
- Compliance / legal blockers with no end date
- Empty / missing reason
- Any mention of "not before season", "after the season", "wait until season starts", or similar season-gating language. The summer season has already started, so these will not convert during Q2.
- Any mention of needing multiple accounts, multi-account support, or connecting more than one business / legal entity to Understory Pay. Pay only supports a single connected account today and that won't change before Q2.

Respond ONLY with valid JSON: an array of {"id": string, "q2_likely": boolean} objects, one per input deal, same order, no prose.`;

export async function classifyUnwillingForQ2(deals: PayDeal[]): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const toClassify: PayDeal[] = [];

  for (const d of deals) {
    if (!d.unwillingReason) {
      result.set(d.dealId, false);
      continue;
    }
    const cached = cache.get(d.unwillingReason);
    if (cached !== undefined) {
      result.set(d.dealId, cached);
      continue;
    }
    toClassify.push(d);
  }

  if (toClassify.length === 0) return result;

  const payload = toClassify.map((d) => ({
    id: d.dealId,
    name: d.dealName,
    reason: d.unwillingReason,
  }));

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    const block = response.content[0];
    const text = block.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      for (const d of toClassify) result.set(d.dealId, false);
      return result;
    }
    const parsed: Array<{ id: string; q2_likely: boolean }> = JSON.parse(jsonMatch[0]);
    const byId = new Map(parsed.map((p) => [p.id, !!p.q2_likely]));
    for (const d of toClassify) {
      const flag = byId.get(d.dealId) ?? false;
      result.set(d.dealId, flag);
      if (d.unwillingReason) cache.set(d.unwillingReason, flag);
    }
  } catch {
    for (const d of toClassify) result.set(d.dealId, false);
  }

  return result;
}
