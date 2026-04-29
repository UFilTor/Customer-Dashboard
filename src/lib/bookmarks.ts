// localStorage-backed pinned-companies list. Lives client-side per device —
// no sync across machines, by design. Filip's CS team is small enough that
// per-device bookmarks are fine; if multi-device sync becomes a need, this
// can move to HubSpot custom properties.

const STORAGE_KEY = "ud-v2-bookmarks";
const MAX_BOOKMARKS = 20;

export interface BookmarkedCompany {
  id: string;
  name: string;
  // Optional cached display fields — refreshed each time the user opens the
  // detail. Keeps the list scannable without a HubSpot lookup per render.
  domain?: string;
  pinnedAt: number;
}

function read(): BookmarkedCompany[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list: BookmarkedCompany[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {/* ignore quota errors */}
}

export function getBookmarks(): BookmarkedCompany[] {
  // Most-recently pinned first.
  return read().slice().sort((a, b) => b.pinnedAt - a.pinnedAt);
}

export function isBookmarked(companyId: string): boolean {
  return read().some((b) => b.id === companyId);
}

export function addBookmark(entry: { id: string; name: string; domain?: string }): void {
  const list = read().filter((b) => b.id !== entry.id);
  const next: BookmarkedCompany = {
    id: entry.id,
    name: entry.name,
    pinnedAt: Date.now(),
  };
  if (entry.domain) next.domain = entry.domain;
  list.unshift(next);
  write(list.slice(0, MAX_BOOKMARKS));
  // Notify listeners so e.g. the CompanyDetail star icon updates without a
  // full reload, and the cmd palette refreshes its bookmarks section.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ud-bookmarks-changed"));
  }
}

export function removeBookmark(companyId: string): void {
  write(read().filter((b) => b.id !== companyId));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ud-bookmarks-changed"));
  }
}

export function toggleBookmark(entry: { id: string; name: string; domain?: string }): boolean {
  if (isBookmarked(entry.id)) {
    removeBookmark(entry.id);
    return false;
  }
  addBookmark(entry);
  return true;
}
