const STORAGE_KEY = "recent-companies";
const MAX_RECENTS = 5;

export interface RecentCompany {
  id: string;
  name: string;
  revenue?: string;
  healthScore?: string;
}

export function getRecentCompanies(): RecentCompany[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function addRecentCompany(company: RecentCompany): void {
  const current = getRecentCompanies().filter((c) => c.id !== company.id);
  const entry: RecentCompany = { id: company.id, name: company.name };
  if (company.revenue) entry.revenue = company.revenue;
  if (company.healthScore) entry.healthScore = company.healthScore;
  const updated = [entry, ...current].slice(0, MAX_RECENTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function removeRecentCompany(id: string): void {
  const updated = getRecentCompanies().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
