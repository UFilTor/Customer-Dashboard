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
- Any mention that the customer is a foundation / "stiftelse" / "stiftung" / "fond". Pay can't onboard foundations today and that won't change before Q2.

Input is a JSON array of {"i": number, "name": string, "reason": string}.
Respond ONLY with a valid JSON array of 0/1 values, one per input deal in the same order (1 = q2_likely true, 0 = false), e.g. [0,1,0,0,1]. Same length as the input. No prose.`;

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

  // Index-based output keeps the response to a few dozen tokens (vs one
  // JSON object per deal), which is most of this call's latency.
  const payload = toClassify.map((d, i) => ({
    i,
    name: d.dealName,
    reason: d.unwillingReason,
  }));

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    const block = response.content[0];
    const text = block.type === "text" ? block.text : "";
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      for (const d of toClassify) result.set(d.dealId, false);
      return result;
    }
    const parsed: number[] = JSON.parse(jsonMatch[0]);
    for (let i = 0; i < toClassify.length; i++) {
      const d = toClassify[i];
      const flag = parsed[i] === 1;
      result.set(d.dealId, flag);
      if (d.unwillingReason) cache.set(d.unwillingReason, flag);
    }
  } catch {
    for (const d of toClassify) result.set(d.dealId, false);
  }

  return result;
}
