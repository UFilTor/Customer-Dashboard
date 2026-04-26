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
