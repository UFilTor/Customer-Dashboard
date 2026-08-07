// localStorage-backed saved Portfolio views — named snapshots of the toolbar
// state (signals, refine, status toggles, sort) that the user keeps coming
// back to. Per device, no sync across machines (same posture as bookmarks.ts).
// The global Person/Region pill is deliberately NOT captured — views compose
// with whatever scope is active.

import type {
  PortfolioRefineState,
  PortfolioSignalKey,
  PortfolioSortKey,
  PortfolioStage,
} from "./types";
import { PORTFOLIO_SIGNAL_ORDER } from "./signals";

const STORAGE_KEY = "ud-v2-portfolio-views";
const DEFAULT_KEY = "ud-v2-portfolio-views-default";
const MAX_VIEWS = 20;
const MAX_NAME_LENGTH = 40;

// Allowlist of sort keys — mirrors PortfolioSortKey in types.ts. Single
// source shared with PortfolioContainer so a poisoned localStorage blob
// can't drop the UI into an unknown sort state.
export const VALID_SORT_KEYS: ReadonlySet<PortfolioSortKey> = new Set<PortfolioSortKey>([
  // Universal
  "urgency",
  "name",
  "stage",
  "revenue",
  "health",
  "last_contact",
  "days_in_stage",
  // Signal-specific
  "oldest_outstanding",
  "value_overdue",
  "count_overdue",
  "due_soonest",
  "value_open",
  "count_open",
  "longest_silence_events",
  "revenue_no_events",
  "biggest_drop",
  "current_score_asc",
  "longest_stuck",
  "days_past_expected",
  "biggest_pct_drop",
  "prior_3m_volume",
  "wish_flagged_recent",
  "longest_silence_quiet",
]);

const VALID_SIGNAL_KEYS: ReadonlySet<string> = new Set(PORTFOLIO_SIGNAL_ORDER);
const VALID_STAGES: ReadonlySet<string> = new Set([
  "Onboarding",
  "Adopted",
  "Started",
  "Ramp Up",
  "Established",
]);

export interface PortfolioShownStatuses {
  paused: boolean;
  product_hold: boolean;
  hibernation: boolean;
  snoozed: boolean;
}

export interface PortfolioViewState {
  signals: PortfolioSignalKey[];
  stackedSignals: boolean;
  refine: PortfolioRefineState;
  shownStatuses: PortfolioShownStatuses;
  sortKey: PortfolioSortKey;
  sortDirection: "asc" | "desc";
}

export interface SavedPortfolioView {
  id: string;
  name: string;
  createdAt: number;
  state: PortfolioViewState;
}

function finiteOrUndef(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function isoDateOrUndef(v: unknown): string | undefined {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;
}

// Rebuild refine field-by-field instead of trusting the stored object — an
// injected blob can't smuggle extra keys or non-numeric thresholds through.
function sanitizeRefine(raw: unknown): PortfolioRefineState {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: PortfolioRefineState = {};
  const acvMin = finiteOrUndef(r.acvMin);
  const acvMax = finiteOrUndef(r.acvMax);
  const daysInStageMin = finiteOrUndef(r.daysInStageMin);
  const daysInStageMax = finiteOrUndef(r.daysInStageMax);
  if (acvMin !== undefined) out.acvMin = acvMin;
  if (acvMax !== undefined) out.acvMax = acvMax;
  if (daysInStageMin !== undefined) out.daysInStageMin = daysInStageMin;
  if (daysInStageMax !== undefined) out.daysInStageMax = daysInStageMax;
  if (Array.isArray(r.stages)) {
    const stages = (r.stages as unknown[])
      .filter((s): s is PortfolioStage => typeof s === "string" && VALID_STAGES.has(s))
      .slice(0, VALID_STAGES.size);
    if (stages.length > 0) out.stages = stages;
  }
  const adoptionAfter = isoDateOrUndef(r.adoptionAfter);
  const adoptionBefore = isoDateOrUndef(r.adoptionBefore);
  if (adoptionAfter) out.adoptionAfter = adoptionAfter;
  if (adoptionBefore) out.adoptionBefore = adoptionBefore;
  const goneQuietMinDays = finiteOrUndef(r.goneQuietMinDays);
  const healthMaxScore = finiteOrUndef(r.healthMaxScore);
  const stuckMinDaysPast = finiteOrUndef(r.stuckMinDaysPast);
  const overdueMinDays = finiteOrUndef(r.overdueMinDays);
  const volumeMinDropPct = finiteOrUndef(r.volumeMinDropPct);
  if (goneQuietMinDays !== undefined) out.goneQuietMinDays = goneQuietMinDays;
  if (healthMaxScore !== undefined) out.healthMaxScore = healthMaxScore;
  if (stuckMinDaysPast !== undefined) out.stuckMinDaysPast = stuckMinDaysPast;
  if (overdueMinDays !== undefined) out.overdueMinDays = overdueMinDays;
  if (volumeMinDropPct !== undefined) out.volumeMinDropPct = volumeMinDropPct;
  return out;
}

function sanitizeState(raw: unknown): PortfolioViewState | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  const signals = Array.isArray(s.signals)
    ? (s.signals as unknown[])
        .filter((k): k is PortfolioSignalKey => typeof k === "string" && VALID_SIGNAL_KEYS.has(k))
        .slice(0, PORTFOLIO_SIGNAL_ORDER.length)
    : [];
  const sortKey: PortfolioSortKey = VALID_SORT_KEYS.has(s.sortKey as PortfolioSortKey)
    ? (s.sortKey as PortfolioSortKey)
    : "urgency";
  const shown = (typeof s.shownStatuses === "object" && s.shownStatuses !== null
    ? s.shownStatuses
    : {}) as Record<string, unknown>;
  return {
    signals,
    stackedSignals: s.stackedSignals === true,
    refine: sanitizeRefine(s.refine),
    shownStatuses: {
      paused: shown.paused === true,
      product_hold: shown.product_hold === true,
      hibernation: shown.hibernation === true,
      snoozed: shown.snoozed === true,
    },
    sortKey,
    sortDirection: s.sortDirection === "asc" ? "asc" : "desc",
  };
}

function read(): SavedPortfolioView[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SavedPortfolioView[] = [];
    for (const item of parsed.slice(0, MAX_VIEWS)) {
      if (typeof item !== "object" || item === null) continue;
      const v = item as Record<string, unknown>;
      if (typeof v.id !== "string" || !v.id) continue;
      if (typeof v.name !== "string" || !v.name.trim()) continue;
      const state = sanitizeState(v.state);
      if (!state) continue;
      out.push({
        id: v.id.slice(0, 40),
        name: v.name.trim().slice(0, MAX_NAME_LENGTH),
        createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
        state,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function write(list: SavedPortfolioView[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_VIEWS)));
  } catch {/* ignore quota errors */}
  invalidateSnapshots();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ud-views-changed"));
  }
}

function invalidateSnapshots(): void {
  viewsSnapshot = null;
  defaultIdSnapshot = undefined;
}

// useSyncExternalStore adapter. getSavedViews() builds a fresh array every
// call, which would loop the store hook — cache the snapshot and invalidate
// on every write/event. Server snapshot is a stable empty list (localStorage
// doesn't exist during SSR); React swaps in the client snapshot post-hydration.
const EMPTY_VIEWS: SavedPortfolioView[] = [];
let viewsSnapshot: SavedPortfolioView[] | null = null;
let defaultIdSnapshot: string | null | undefined = undefined;

export function subscribeSavedViews(onChange: () => void): () => void {
  const handler = () => {
    invalidateSnapshots();
    onChange();
  };
  window.addEventListener("ud-views-changed", handler);
  return () => window.removeEventListener("ud-views-changed", handler);
}

export function getSavedViewsSnapshot(): SavedPortfolioView[] {
  if (viewsSnapshot === null) viewsSnapshot = getSavedViews();
  return viewsSnapshot;
}

export function getSavedViewsServerSnapshot(): SavedPortfolioView[] {
  return EMPTY_VIEWS;
}

export function getDefaultViewIdSnapshot(): string | null {
  if (defaultIdSnapshot === undefined) defaultIdSnapshot = getDefaultViewId();
  return defaultIdSnapshot;
}

export function getDefaultViewIdServerSnapshot(): string | null {
  return null;
}

// ---------- Default view ----------
// One saved view can be marked as the default: it's applied automatically
// when Portfolio loads (superseding the legacy Cmd+S signals+sort default).

/** The default view's id, or null. Ignores ids that no longer exist. */
export function getDefaultViewId(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const id = localStorage.getItem(DEFAULT_KEY);
    if (!id) return null;
    return read().some((v) => v.id === id) ? id : null;
  } catch {
    return null;
  }
}

export function getDefaultSavedView(): SavedPortfolioView | null {
  const id = getDefaultViewId();
  if (!id) return null;
  return read().find((v) => v.id === id) ?? null;
}

/** Mark a view as default (null clears). */
export function setDefaultView(id: string | null): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (id) localStorage.setItem(DEFAULT_KEY, id);
    else localStorage.removeItem(DEFAULT_KEY);
  } catch {/* ignore quota errors */}
  invalidateSnapshots();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ud-views-changed"));
  }
}

export function getSavedViews(): SavedPortfolioView[] {
  // Newest first.
  return read().slice().sort((a, b) => b.createdAt - a.createdAt);
}

/** Save the current toolbar state under a name. Same name replaces. Returns the saved view. */
export function saveView(name: string, state: PortfolioViewState): SavedPortfolioView | null {
  const clean = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!clean) return null;
  const existing = read();
  const replaced = existing.find((v) => v.name.toLowerCase() === clean.toLowerCase());
  const replacedWasDefault = replaced != null && getDefaultViewId() === replaced.id;
  const list = existing.filter((v) => v.name.toLowerCase() !== clean.toLowerCase());
  const view: SavedPortfolioView = {
    id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: clean,
    createdAt: Date.now(),
    // Round-trip through the sanitizer so what we persist is exactly what a
    // future read would accept.
    state: sanitizeState(state) ?? {
      signals: [],
      stackedSignals: false,
      refine: {},
      shownStatuses: { paused: false, product_hold: false, hibernation: false, snoozed: false },
      sortKey: "urgency",
      sortDirection: "desc",
    },
  };
  list.unshift(view);
  write(list);
  // Re-saving over the default view keeps it the default (new id).
  if (replacedWasDefault) setDefaultView(view.id);
  return view;
}

export function deleteView(id: string): void {
  // Clear the marker first so a deleted default doesn't linger in storage.
  if (getDefaultViewId() === id) setDefaultView(null);
  write(read().filter((v) => v.id !== id));
}
