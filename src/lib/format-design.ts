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

export function fmtMrr(n: number | null | undefined): string {
  if (!n) return "—";
  return "€" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
  // also show up. Normalise so anything >= 1 is treated as 0-100.
  const num = Math.round(n > 1 ? n : n * 100);
  let label: string;
  let tone: HealthInfo["tone"];
  if (num < 40) { label = "Weak"; tone = "bad"; }
  else if (num < 60) { label = "At risk"; tone = "warn"; }
  else if (num < 80) { label = "Good"; tone = "good"; }
  else { label = "Strong"; tone = "good"; }
  return { label, num, tone };
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
