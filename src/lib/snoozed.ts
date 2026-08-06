// localStorage-backed snoozed-companies list for the Portfolio view. Lives
// client-side per device — no sync across machines, by design (same posture
// as bookmarks.ts; can move to HubSpot custom properties if sync becomes a
// need). Snoozed rows are hidden from Portfolio by default; the Status filter
// pill can toggle them back in.

const STORAGE_KEY = "ud-v2-snoozed";
const MAX_SNOOZED = 200;

export interface SnoozedCompany {
  companyId: string;
  snoozedAt: number;
  /** Epoch ms when the snooze expires. Expired entries are pruned on read. */
  until: number;
}

function isValidEntry(e: unknown): e is SnoozedCompany {
  if (typeof e !== "object" || e === null) return false;
  const c = e as Record<string, unknown>;
  return (
    typeof c.companyId === "string" &&
    c.companyId.length > 0 &&
    c.companyId.length < 64 &&
    typeof c.snoozedAt === "number" &&
    typeof c.until === "number" &&
    Number.isFinite(c.until)
  );
}

function read(): SnoozedCompany[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate every entry (poisoned-blob defence, same as loadDefaults) and
    // prune expired snoozes so expiry is automatic on the next read.
    const now = Date.now();
    return parsed
      .filter(isValidEntry)
      .filter((e) => e.until > now)
      .slice(0, MAX_SNOOZED);
  } catch {
    return [];
  }
}

function write(list: SnoozedCompany[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_SNOOZED)));
  } catch {/* ignore quota errors */}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ud-snoozed-changed"));
  }
}

export function getSnoozed(): SnoozedCompany[] {
  return read();
}

/** Set of currently snoozed company ids — the shape the filter pipeline wants. */
export function getSnoozedIds(): Set<string> {
  return new Set(read().map((e) => e.companyId));
}

export function getSnoozeUntil(companyId: string): number | null {
  return read().find((e) => e.companyId === companyId)?.until ?? null;
}

/** Snooze a company until the given epoch ms. Re-snoozing replaces the old entry. */
export function snoozeCompany(companyId: string, until: number): void {
  if (!Number.isFinite(until) || until <= Date.now()) return;
  const list = read().filter((e) => e.companyId !== companyId);
  list.unshift({ companyId, snoozedAt: Date.now(), until });
  write(list);
}

export function unsnoozeCompany(companyId: string): void {
  write(read().filter((e) => e.companyId !== companyId));
}
