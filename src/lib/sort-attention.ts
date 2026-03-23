import type { AttentionCompany } from "./types";

export type SortField = "mrr" | "daysOverdue" | "daysSilent";

function parseMrr(value: string | undefined): number {
  if (!value) return 0;
  // Strip non-numeric characters except dots (handles "1 500", "$1,500", etc.)
  const cleaned = value.replace(/[^\d.]/g, "");
  return parseFloat(cleaned) || 0;
}

function getSortValue(company: AttentionCompany, field: SortField): number {
  if (field === "mrr") return parseMrr(company.mrr);
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
