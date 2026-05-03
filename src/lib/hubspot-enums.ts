// Single source of truth for HubSpot enum-like property values.
// Update when HubSpot enum lists change. Drift between this file and
// HubSpot's stored values is what causes silent blank Lookup results —
// search-diagnostics.ts surfaces drift the next time it bites.

export const COUNTRY_CODES = {
  DK: "Denmark",
  SE: "Sweden",
  NO: "Norway",
  DE: "Germany",
  IT: "Italy",
  GB: "United Kingdom",
  GL: "Greenland",
} as const;

export type CountryCode = keyof typeof COUNTRY_CODES;

// Properties whose stored values are a fixed set. The prompt builder injects
// these so the LLM emits the exact stored string; the diagnostics module uses
// them so a 0-result EQ filter can suggest the nearest valid value.
export const KNOWN_VALUES: Record<string, readonly string[]> = {
  understory_company_country: Object.keys(COUNTRY_CODES),
  understory_pay_status__customer: [
    "Live",
    "Verified",
    "Pending Verification",
    "Started Onboarding",
    "Signed - Not Started",
    "Not yet enrolled",
    "Unwilling",
    "Ineligible",
  ],
  customer_stage: [
    "Started",
    "Adopted",
    "Hibernation",
    "Product Hold",
    "Established",
    "Churned",
  ],
  wish_to_churn: ["true", "false"],
  hs_email_direction: ["INCOMING_EMAIL", "FORWARDED_EMAIL", "EMAIL"],
  subscription_plan: ["Starter", "Grow", "Bloom", "Growth"],
};

export function humaniseValue(propertyName: string, value: string): string {
  if (propertyName === "understory_company_country") {
    const name = (COUNTRY_CODES as Record<string, string>)[value];
    return name ? `${name} (${value})` : value;
  }
  return value;
}

export function closestMatch(
  input: string,
  candidates: readonly string[],
  topN = 5,
  propertyName?: string,
): string[] {
  if (candidates.length === 0) return [];
  const lowerInput = input.toLowerCase().trim();

  let forced: string | null = null;
  if (propertyName === "understory_company_country") {
    for (const [code, name] of Object.entries(COUNTRY_CODES)) {
      if (name.toLowerCase() === lowerInput) {
        forced = code;
        break;
      }
    }
  }

  const scored = candidates.map((c) => {
    const lc = c.toLowerCase();
    let score = levenshtein(lowerInput, lc);
    if (lc === lowerInput) score = -100;
    else if (lc.startsWith(lowerInput) || lowerInput.startsWith(lc)) score -= 50;
    return { c, score };
  });
  scored.sort((a, b) => a.score - b.score);
  const ordered = scored.map((s) => s.c);

  if (forced) {
    const without = ordered.filter((c) => c !== forced);
    return [forced, ...without].slice(0, topN);
  }
  return ordered.slice(0, topN);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = Array(b.length + 1)
    .fill(0)
    .map((_, i) => i);
  const curr: number[] = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}
