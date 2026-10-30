// Display formatters for the redesigned dashboard.
// Mirrors the design system primitives so views match the handoff exactly.

export function fmtEur(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return "€" + (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return "€" + (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return "€" + Math.round(n);
}

export function fmtEurFull(n: number | null | undefined): string {
  if (n == null || n === 0) return "—";
  return "€" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

// `understory_health_score_upcoming_events` is a 0-1 score where each
// 0.20 step represents one event up to 5+, which saturates at 1.00.
// Returns the brief-display string ("3 scheduled" / "5+ scheduled" / "0")
// or null when no data is available.
export function fmtFutureEvents(score: number | null | undefined): string | null {
  if (score == null) return null;
  if (score >= 1) return "5+ scheduled";
  const count = Math.round(score * 5);
  return count === 0 ? "0" : `${count} scheduled`;
}

export interface HealthInfo {
  label: string;
  num: number | null;
  tone: "muted" | "bad" | "warn" | "good";
}

export function fmtHealth(score: string | number | null | undefined): HealthInfo {
  if (score == null || score === "") return { label: "—", num: null, tone: "muted" };
  const n = typeof score === "number" ? score : parseFloat(score);
  if (isNaN(n)) return { label: "—", num: null, tone: "muted" };
  // Health scores are stored 0-100 in the live HubSpot data, but legacy 0-1 ratios
  // also show up. Only a fraction strictly between 0 and 1 is a ratio: whole
  // scores of 0 and 1 are real 0-100 scores (live data has both), and reading
  // 1 as a ratio showed those accounts as "Strong (100)".
  // TODO(simplification): the scale is still guessed from the value, so a
  // legacy ratio stored as exactly 1.0 (100%) now reads as 1. Upgrade path:
  // drop ratio support once no legacy 0-1 scores remain in HubSpot.
  const num = Math.round(n > 0 && n < 1 ? n * 100 : n);
  return { ...healthBand(num), num };
}

/** Band for a 0-100 score. */
function healthBand(num: number): { label: string; tone: HealthInfo["tone"] } {
  if (num < 40) return { label: "Weak", tone: "bad" };
  if (num < 60) return { label: "At risk", tone: "warn" };
  if (num < 80) return { label: "Good", tone: "good" };
  return { label: "Strong", tone: "good" };
}

export function relDays(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + "d ago";
  if (days < 365) return Math.floor(days / 30) + "mo ago";
  return d.toISOString().split("T")[0];
}

// HubSpot's `domain` property sometimes already carries a scheme. Prefixing
// unconditionally produces "https://https://example.com" (a dead link) for
// those records. Strip an existing scheme before adding ours.
export function toWebUrl(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

export type TextSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

// A URL runs to the next whitespace but never ends on sentence punctuation, so
// "see https://x.com/:" links "https://x.com/" and leaves the colon as text.
// TODO(simplification): a URL that really ends in ")" (Wikipedia-style) loses
// it; balance parentheses if such links show up in notes.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]*[^\s<>".,;:!?'")\]]/gi;

// Free-text HubSpot notes mix several URLs with prose. Split them so each URL
// becomes its own link and the prose stays plain text.
export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0];
    if (match.index > last) segments.push({ kind: "text", text: text.slice(last, match.index) });
    segments.push({ kind: "link", text: url, href: toWebUrl(url) });
    last = match.index + url.length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}
