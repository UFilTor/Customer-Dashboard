import Anthropic from "@anthropic-ai/sdk";
import { HAIKU_MODEL } from "./llm";
import { Cache } from "./cache";
import type { Engagement, WatchOutSignal } from "./types";

// LLM classifier over call/meeting note bodies. Extracts conversation-level
// flags no HubSpot property rule can catch ("we're evaluating alternatives")
// and maps them onto the WatchOutSignal taxonomy so they render everywhere
// signals already render. Pattern mirrors pay-q2-classifier.ts: one Haiku
// call per company, defensive JSON parse, per-process cache.

// Lazy so importing the pure helpers (parseNoteFlags, noteFlagsToSignals)
// in tests doesn't construct an SDK client.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export type NoteFlagKind =
  | "churn_risk_mentioned"
  | "pricing_complaint"
  | "feature_blocker"
  | "expansion_interest";

export interface NoteFlag {
  kind: NoteFlagKind;
  // Short verbatim quote from the note that justifies the flag. Rendered in
  // the UI so the CS owner can judge false positives themselves.
  evidence: string;
  engagementDate: string; // ISO timestamp of the source call/meeting
  engagementTitle: string;
}

const VALID_KINDS = new Set<string>([
  "churn_risk_mentioned",
  "pricing_complaint",
  "feature_blocker",
  "expansion_interest",
]);

// 6h TTL keyed on companyId + newest engagement timestamp, so a new call
// automatically invalidates. Bounded LRU via Cache.
const flagCache = new Cache<NoteFlag[]>(6 * 60 * 60 * 1000, 128);

const LOOKBACK_DAYS = 60;
const MAX_ENGAGEMENTS = 8;
const MAX_CHARS_PER_ENGAGEMENT = 3000;

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// Gong transcripts can be tens of thousands of chars. Keep head + tail —
// openings and wrap-ups carry most of the risk/expansion language.
function clampBody(text: string): string {
  if (text.length <= MAX_CHARS_PER_ENGAGEMENT) return text;
  return `${text.slice(0, 2000)}\n[...]\n${text.slice(-1000)}`;
}

const SYSTEM_PROMPT = `You extract customer-relationship flags from CS call/meeting notes for a booking platform's dashboard.

Flag kinds (only these four):
- churn_risk_mentioned: the customer talks about leaving, cancelling, evaluating competitors/alternatives, pausing the subscription, or being seriously unhappy with the relationship.
- pricing_complaint: the customer pushes back on fees, pricing, invoices being too high, or asks for discounts out of dissatisfaction.
- feature_blocker: a missing or broken product capability is blocking the customer from using or expanding usage of the platform.
- expansion_interest: the customer expresses interest in more products, more locations/entities, higher volume, or upsell offerings.

Rules:
- Only flag when the note clearly supports it. Jokes, hypotheticals, and CS-side speculation do NOT count.
- churn_risk_mentioned requires explicit language from the customer side.
- evidence must be a short verbatim quote (max 140 chars) copied from the note, in its original language.
- At most one flag per kind per note; skip notes with nothing notable.

Input: JSON array of {"i": number, "type": string, "title": string, "body": string}.
Respond ONLY with a valid JSON array of {"i": number, "kind": string, "evidence": string}. Empty array [] when nothing qualifies. No prose.`;

/** Pure response parsing — exported for tests. */
export function parseNoteFlags(
  text: string,
  engagements: Array<{ timestamp: string; title: string }>
): NoteFlag[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const flags: NoteFlag[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { i, kind, evidence } = item as { i?: unknown; kind?: unknown; evidence?: unknown };
    if (typeof i !== "number" || i < 0 || i >= engagements.length) continue;
    if (typeof kind !== "string" || !VALID_KINDS.has(kind)) continue;
    if (typeof evidence !== "string" || evidence.trim() === "") continue;
    // One flag per kind across the whole account keeps the UI calm — the
    // newest engagement wins because notes are sent newest-first.
    if (seen.has(kind)) continue;
    seen.add(kind);
    flags.push({
      kind: kind as NoteFlagKind,
      evidence: evidence.trim().slice(0, 140),
      engagementDate: engagements[i].timestamp,
      engagementTitle: engagements[i].title,
    });
  }
  return flags;
}

/**
 * Classify a company's recent calls/meetings into note flags. One Haiku call
 * per (company, latest engagement) pair; results cached 6h.
 */
export async function classifyNotes(
  companyId: string,
  engagements: Engagement[]
): Promise<NoteFlag[]> {
  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const relevant = engagements
    .filter((e) => (e.type === "call" || e.type === "meeting") && !!e.body)
    .filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= Date.now();
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_ENGAGEMENTS)
    .map((e) => ({ ...e, cleanBody: clampBody(stripHtml(e.body)) }))
    .filter((e) => e.cleanBody.length > 50);

  if (relevant.length === 0) return [];

  const cacheKey = `${companyId}:${relevant[0].timestamp}`;
  const cached = flagCache.get(cacheKey);
  if (cached) return cached;

  return flagCache.getOrBuild(cacheKey, async () => {
    try {
      const payload = relevant.map((e, i) => ({
        i,
        type: e.type,
        title: e.title,
        body: e.cleanBody,
      }));
      const response = await getClient().messages.create({
        model: HAIKU_MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      });
      const block = response.content[0];
      const text = block.type === "text" ? block.text : "";
      return parseNoteFlags(text, relevant);
    } catch {
      return [];
    }
  });
}

const FLAG_TITLES: Record<NoteFlagKind, string> = {
  churn_risk_mentioned: "Churn risk mentioned",
  pricing_complaint: "Pricing complaint",
  feature_blocker: "Feature blocker",
  expansion_interest: "Expansion interest",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Map note flags onto the shared WatchOutSignal shape for rendering. */
export function noteFlagsToSignals(flags: NoteFlag[]): WatchOutSignal[] {
  return flags.map((f) => ({
    kind: f.kind,
    // Only explicit churn language shouts; the rest are warn-level.
    severity: f.kind === "churn_risk_mentioned" ? "bad" : "warn",
    title: FLAG_TITLES[f.kind],
    detail: `"${f.evidence}" — ${fmtDate(f.engagementDate)}`,
  }));
}
