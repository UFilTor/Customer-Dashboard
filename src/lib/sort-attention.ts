import type { AttentionCompany } from "./types";

export type SortField = "mrr" | "daysOverdue" | "daysSilent";

// Approximate exchange rates to EUR for sorting purposes
const TO_EUR: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.16,
  SEK: 0.087,
  NOK: 0.086,
  DKK: 0.134,
};

function parseMrr(value: string | undefined, currency?: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.]/g, "");
  const numeric = parseFloat(cleaned) || 0;
  if (!currency) return numeric;
  const rate = TO_EUR[currency.toUpperCase()] ?? 1;
  return numeric * rate;
}

function getSortValue(company: AttentionCompany, field: SortField): number {
  if (field === "mrr") return parseMrr(company.mrr, company.currency);
  return (company[field] as number) ?? 0;
}

export function sortAttentionCompanies(
  companies: AttentionCompany[],
  field: SortField
): AttentionCompany[] {
  return [...companies].sort((a, b) => {
    const diff = getSortValue(b, field) - getSortValue(a, field);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}
