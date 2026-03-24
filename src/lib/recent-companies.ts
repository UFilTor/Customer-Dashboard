const STORAGE_KEY = "recent-companies";
const MAX_RECENTS = 5;

const TO_EUR: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, SEK: 0.087, NOK: 0.086, DKK: 0.134,
};

export function computeRevenueFromDetail(
  company: Record<string, string>,
  deal: Record<string, string> | null
): string | undefined {
  const volume = parseFloat(company.understory_booking_volume_12m || "0") || 0;
  const fee = parseFloat(deal?.booking_fee || deal?.confirmed_booking_fee || "0") || 0;
  const mrr = parseFloat(deal?.confirmed__contract_mrr || "0") || 0;
  if (volume === 0 && mrr === 0) return undefined;
  const currency = (deal?.deal_currency_code || "EUR").toUpperCase();
  const mrrRate = TO_EUR[currency] ?? 1;
  const createTime = company.createdate ? new Date(company.createdate).getTime() : 0;
  const monthsAsCustomer = createTime > 0
    ? Math.min(12, Math.floor((Date.now() - createTime) / (30.44 * 24 * 60 * 60 * 1000)))
    : 12;
  const eur = Math.round((volume * fee) + (mrr * monthsAsCustomer * mrrRate));
  if (eur === 0) return undefined;
  return `\u20ac${eur.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

export interface RecentCompany {
  id: string;
  name: string;
  revenue?: string;
  healthScore?: string;
  domain?: string;
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
  if (company.domain) entry.domain = company.domain;
  const updated = [entry, ...current].slice(0, MAX_RECENTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function removeRecentCompany(id: string): void {
  const updated = getRecentCompanies().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function clearRecentCompanies(): void {
  localStorage.removeItem(STORAGE_KEY);
}
