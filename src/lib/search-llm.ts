import Anthropic from "@anthropic-ai/sdk";
import { OWNERS } from "./owners";
import type {
  GlobalFilter,
} from "./owners";
import type { SearchSpec } from "./types";

// Claude-Haiku-backed natural-language → SearchSpec parser.
//
// Single-message JSON-in-prompt (mirrors `summarize.ts`'s pattern). The LLM
// receives the user's query, the active filter context, the per-entity
// property allowlists, the operator allowlist, the owner directory, and a
// handful of worked examples. It emits a strict JSON SearchSpec that
// `search.ts` validates before any HubSpot call. The LLM never sees a HubSpot
// token and never makes HTTP calls itself — the prompt is intentionally
// boxed-in so a hallucination becomes a validation failure, not a real query.

const client = new Anthropic();

// Per-entity field allowlist — duplicated from where each lib reads them so
// the LLM only sees fields HubSpot actually exposes. If the LLM picks a field
// outside this list, validation in search.ts rejects the spec.
const ENTITY_FIELDS: Record<string, string[]> = {
  deal: [
    "dealname",
    "dealstage",
    "pipeline",
    "hubspot_owner_id",
    "createdate",
    "amount",
    "amount_in_home_currency",
    "deal_currency_code",
    "confirmed__contract_mrr",
    "confirmed_booking_fee",
    "booking_fee",
    "test_billing_start_date",
    "understory_pay_status__customer",
    "customer_stage",
    "customer_substage",
    "wish_to_churn",
    "churn_reason",
    "churned_reason_elaborated",
    "churn_date",
    "ob_note___customer_needs_",
    "ob_note___promises_made",
    "ob_note___grow_notes__if_booked_",
    "ob_note___link_to_experience_s__that_need_to_be_created_",
    "hibernation_notes",
    "product_hold_note",
    "hs_next_step",
  ],
  company: [
    "name",
    "domain",
    "hubspot_owner_id",
    "createdate",
    "understory_company_country",
    "health_score",
    "understory_pay_status__customer",
    "subscription_plan",
    "notes_last_contacted",
    "understory_latest_event",
    "understory_booking_volume_12m",
    "understory_booking_volume_3m",
    "understory_booking_volume_6m",
    "understory_total_number_of_transactions",
  ],
  note: ["hs_note_body", "hs_timestamp", "hubspot_owner_id"],
  meeting: [
    "hs_meeting_title",
    "hs_meeting_body",
    "hs_internal_meeting_notes",
    "hs_meeting_outcome",
    "hs_meeting_start_time",
    "hs_meeting_end_time",
    "hubspot_owner_id",
  ],
  call: [
    "hs_call_body",
    "hs_call_title",
    "hs_call_disposition",
    "hs_timestamp",
    "hubspot_owner_id",
  ],
  email: [
    "hs_email_subject",
    "hs_email_text",
    "hs_email_direction",
    "hs_timestamp",
    "hubspot_owner_id",
  ],
};

const OPERATORS = [
  "EQ",
  "NEQ",
  "GT",
  "LT",
  "GTE",
  "LTE",
  "CONTAINS_TOKEN",
  "IN",
  "NOT_IN",
  "HAS_PROPERTY",
  "BETWEEN",
];

function ownerDirectoryBlock(): string {
  return OWNERS.map((o) => `  ${o.name} (${o.region}) → ownerId "${o.id}"`).join("\n");
}

function entityFieldsBlock(): string {
  return Object.entries(ENTITY_FIELDS)
    .map(([entity, fields]) => `  ${entity}: ${fields.join(", ")}`)
    .join("\n");
}

// Enum-property values that the LLM cannot guess from the user's phrasing.
// HubSpot stores these as exact strings; "Pay-unwilling" / "pay unwilling"
// fail to match — the actual enum value is "Unwilling".
const ENUM_VALUES_BLOCK = `Enum values (use EXACTLY these strings, never reformat):
  understory_pay_status__customer: "Live" | "Verified" | "Pending Verification" | "Started Onboarding" | "Signed - Not Started" | "Not yet enrolled" | "Unwilling" | "Ineligible"
  customer_stage: "Started" | "Adopted" | "Hibernation" | "Product Hold" | "Established" | "Churned"
  wish_to_churn: "true" | "false"
  hs_email_direction: "INCOMING_EMAIL" | "FORWARDED_EMAIL" | "EMAIL"
  understory_company_country: any country name as it appears in HubSpot ("Denmark", "Sweden", "Italy", "Norway", "Germany", etc — never an ISO code like "DK")
  subscription_plan: "Starter" | "Grow" | "Bloom" | "Growth" | other plan names`;

function filterContextBlock(filter: GlobalFilter): string {
  if (filter.kind === "person") {
    const o = OWNERS.find((x) => x.id === filter.ownerId);
    return `Active filter: person = ${o ? o.name : filter.ownerId} (ownerId "${filter.ownerId}"). Treat "in my name" / "mine" as this owner.`;
  }
  if (filter.kind === "region") {
    const ownerIds = OWNERS.filter((o) => o.region === filter.region).map((o) => `"${o.id}"`);
    return `Active filter: region = ${filter.region} (ownerIds [${ownerIds.join(", ")}]). Treat "in my region" / "the team" as these owners.`;
  }
  return `Active filter: all (no scope). If the query says "mine" the user has not picked a person — return an error spec.`;
}

const EXAMPLES = `Example 1 (single term)
Query: "All deals in my name that mention GYG in OB notes"
Active filter: person = Filip (ownerId "1939229547")
Output:
{"targets":[{"entityType":"deal","filters":[{"propertyName":"hubspot_owner_id","operator":"EQ","value":"1939229547"}],"textSearch":{"terms":["GYG"],"fields":["ob_note___customer_needs_","ob_note___promises_made","ob_note___grow_notes__if_booked_","ob_note___link_to_experience_s__that_need_to_be_created_"]}}],"ownerScope":{"kind":"person","value":"1939229547"},"limit":100}

Example 2 (no text search)
Query: "Companies in DK with health score below 50"
Active filter: all
Output:
{"targets":[{"entityType":"company","filters":[{"propertyName":"understory_company_country","operator":"EQ","value":"Denmark"},{"propertyName":"health_score","operator":"LT","value":"50"}],"textSearch":null}],"ownerScope":{"kind":"all"},"limit":100}

Example 3 (multi-word phrase — each word is its own term)
Query: "Calls where we discussed seasonal pricing"
Active filter: all
Output:
{"targets":[{"entityType":"call","filters":[],"textSearch":{"terms":["seasonal","pricing"],"fields":["hs_call_body","hs_call_title"]}}],"ownerScope":{"kind":"all"},"limit":100}

Example 4 (synonyms / OR — each alias is a separate term, "OB notes" expands to all 7 deal text fields)
Query: "deals that mention GYG or getyourguide in OB notes"
Active filter: all
Output:
{"targets":[{"entityType":"deal","filters":[],"textSearch":{"terms":["GYG","getyourguide"],"fields":["ob_note___customer_needs_","ob_note___promises_made","ob_note___grow_notes__if_booked_","ob_note___link_to_experience_s__that_need_to_be_created_","hibernation_notes","product_hold_note","hs_next_step"]}}],"ownerScope":{"kind":"all"},"limit":100}

Example 5 (refinement turn — priorSpec is provided)
priorSpec: {"targets":[{"entityType":"deal","filters":[],"textSearch":{"terms":["GYG"],"fields":["ob_note___customer_needs_","ob_note___promises_made"]}}],"ownerScope":{"kind":"all"},"limit":100}
Query: "narrow to last month"
Output: (assuming today is 2026-04-30, last month means after 2026-03-30)
{"targets":[{"entityType":"deal","filters":[{"propertyName":"createdate","operator":"GTE","value":"2026-03-30"}],"textSearch":{"terms":["GYG"],"fields":["ob_note___customer_needs_","ob_note___promises_made"]}}],"ownerScope":{"kind":"all"},"limit":100}

Example 6 (multi-target)
Query: "Everything about Acme"
Active filter: all
Output:
{"targets":[{"entityType":"company","filters":[],"textSearch":{"terms":["Acme"],"fields":["name","domain"]}},{"entityType":"deal","filters":[],"textSearch":{"terms":["Acme"],"fields":["dealname"]}},{"entityType":"meeting","filters":[],"textSearch":{"terms":["Acme"],"fields":["hs_meeting_title","hs_meeting_body"]}},{"entityType":"call","filters":[],"textSearch":{"terms":["Acme"],"fields":["hs_call_body","hs_call_title"]}}],"ownerScope":{"kind":"all"},"limit":100}`;

function buildPrompt(
  query: string,
  filter: GlobalFilter,
  priorSpec: SearchSpec | null
): string {
  const today = new Date().toISOString().split("T")[0];

  const refinementBlock = priorSpec
    ? `\nThis is a REFINEMENT turn. The user already searched and now wants to narrow / adjust the prior result.\nThe prior SearchSpec was:\n${JSON.stringify(priorSpec)}\nKeep filters that still apply; remove filters the new query overrides; add new filters the new query introduces.\n`
    : "";

  return `You convert a natural-language CRM query into a strict JSON SearchSpec for HubSpot's search API.

Today's date: ${today}

${filterContextBlock(filter)}
${refinementBlock}
Owner directory (the four CS owners):
${ownerDirectoryBlock()}

Per-entity field allowlist — pick property names ONLY from this list:
${entityFieldsBlock()}

${ENUM_VALUES_BLOCK}

Operator allowlist (HubSpot search):
  ${OPERATORS.join(", ")}

Output rules:
- Respond with ONLY valid JSON, no prose, no markdown.
- "targets" is an array — fan out across multiple entity types when the query is ambiguous about target.
- A target's "filters" are AND-combined. Use them for things like owner, country, dates.
- A target's "textSearch.terms" is an array of single CONTAINS_TOKEN-friendly words. Each is OR-fanned across "fields". Synonyms / aliases ("GYG" and "getyourguide") become separate terms in the array. Multi-word phrases ("seasonal pricing") split into their constituent words.
- HubSpot's CONTAINS_TOKEN matches whole tokens only (case-insensitive). Never put multiple words in a single term — "GYG getyourguide" never matches anything.
- Time references like "last month" / "in the last 2 weeks" → GTE filter on the relevant timestamp field (createdate / hs_timestamp / hs_meeting_start_time depending on entity).
- "mine" / "in my name" maps to the active filter's owner id when filter.kind === "person". When filter.kind === "all" and the query says "mine", emit {"targets":[],"ownerScope":{"kind":"all"},"limit":0,"_error":"Set the Filter pill to a person to use 'mine'."}
- If the user names an owner directly ("filips name", "Cecilia's deals", etc) regardless of the active filter, look up the matching owner id from the directory above and use it.
- "OB notes" / "the notes" / "anywhere in the notes" / "in the deal" on a deal expands to ALL seven free-text deal fields, in this order: ob_note___customer_needs_, ob_note___promises_made, ob_note___grow_notes__if_booked_, ob_note___link_to_experience_s__that_need_to_be_created_, hibernation_notes, product_hold_note, hs_next_step. The runtime handles the HubSpot 5-filterGroup cap automatically — emit all 7 fields, do NOT trim.
- limit is always 100 unless the user explicitly asks for more.
- Never invent property names or operators. If you can't express a constraint, drop it rather than fake it.

${EXAMPLES}

User query: "${query}"

Respond with ONLY valid JSON in this exact format (the same shape as the examples above):`;
}

// Rough char-budget for the body of LLM output. We reserve enough for a multi-
// target spec with several text-search fields. ~1.2K tokens is plenty.
const MAX_TOKENS = 1200;

export interface ParseResult {
  spec: SearchSpec | null;
  error?: string;
}

export async function parseQuery(
  query: string,
  filter: GlobalFilter,
  priorSpec: SearchSpec | null = null
): Promise<ParseResult> {
  const prompt = buildPrompt(query, filter, priorSpec);
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    if (block.type !== "text") {
      return { spec: null, error: "LLM returned non-text content." };
    }
    // Strip ```json wrappers / surrounding whitespace, same defensive scrub
    // as summarize.ts's recap path.
    const cleanText = block.text
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      return {
        spec: null,
        error: "Couldn't parse the response into JSON. Try rephrasing.",
      };
    }
    // The LLM is allowed to bail out with an explicit `_error` (see prompt) —
    // surface it back unmodified so the UI shows the human message.
    if (
      parsed &&
      typeof parsed === "object" &&
      "_error" in parsed &&
      typeof (parsed as Record<string, unknown>)._error === "string"
    ) {
      return {
        spec: null,
        error: (parsed as Record<string, unknown>)._error as string,
      };
    }
    // Cast — search.ts is the authoritative validator.
    return { spec: parsed as SearchSpec };
  } catch (err) {
    console.error(
      "[search-llm] parseQuery failed:",
      err instanceof Error ? err.message : err
    );
    return { spec: null, error: "Search service is temporarily unavailable." };
  }
}
