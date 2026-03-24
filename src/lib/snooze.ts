import type { AttentionSignal } from "./types";

const STORAGE_KEY = "snoozed-companies";

export interface SnoozedCompany {
  companyId: string;
  signal: AttentionSignal;
  snoozeUntil: string;
  companyName: string;
}

export function getSnoozedCompanies(): SnoozedCompany[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = new Date().toISOString();
    const active = parsed.filter(
      (s: SnoozedCompany) => s.snoozeUntil > now
    );
    if (active.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    }
    return active;
  } catch {
    return [];
  }
}

export function snoozeCompany(entry: SnoozedCompany): void {
  const current = getSnoozedCompanies().filter(
    (s) => !(s.companyId === entry.companyId && s.signal === entry.signal)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, entry]));
}

export function unsnoozeCompany(companyId: string, signal: AttentionSignal): void {
  const updated = getSnoozedCompanies().filter(
    (s) => !(s.companyId === companyId && s.signal === signal)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function isCompanySnoozed(companyId: string, signal: AttentionSignal): boolean {
  return getSnoozedCompanies().some(
    (s) => s.companyId === companyId && s.signal === signal
  );
}
