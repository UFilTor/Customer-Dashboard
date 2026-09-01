"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PortfolioResponse,
  PortfolioRow,
  PortfolioDefaults,
  PortfolioRefineState,
  PortfolioSignalKey,
  PortfolioSortKey,
} from "@/lib/types";
import { effectiveCountries, effectiveOwnerIds, type GlobalFilter, parseFilter, serializeFilter } from "@/lib/owners";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-fetch";
import { extractSortKey, getSortOptions, mapKindToKey, matchesPortfolioSearch } from "@/lib/portfolio";
import { PORTFOLIO_SIGNAL_ORDER, PORTFOLIO_SIGNAL_MAP } from "@/lib/signals";
import { getSnoozed, snoozeCompany, unsnoozeCompany, type SnoozedCompany } from "@/lib/snoozed";
import {
  VALID_SORT_KEYS,
  getDefaultSavedView,
  type PortfolioShownStatuses,
  type PortfolioViewState,
} from "@/lib/portfolio-views";
import { reportFreshness } from "@/lib/freshness";
import { announce } from "@/lib/live-announcer";
import { groupByStage, flattenBoard, flattenBoardOffsets, type KanbanColumn, type KanbanColumnKey } from "@/lib/portfolio-kanban";
import { PortfolioKanbanView } from "./PortfolioKanbanView";
import { PortfolioView } from "./PortfolioView";
import { COLS_GRID_WITH_OWNER } from "./portfolio/chrome";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Pagination size. Default 50 rows per page — large enough that scrolling
// stays useful within a page (Urgency-sorted top 50 covers a typical
// morning's actions), small enough that the eye doesn't need to "give up"
// on a 774-row scroll. Selectors live above and below the list so a user
// scrolling the page never has to reach back to the top to switch pages.
const PAGE_SIZE = 50;

interface Props {
  filter: GlobalFilter;
  filterLabel: string | null;
  // When false (typically when the global filter is a single-person filter),
  // the OWNER column hides because every row would show the same avatar.
  showAvatar?: boolean;
  onSelectCompany: (companyId: string) => void;
  // Free-text account filter. Owned by page-client (URL param `q`) rather than
  // this container: opening a company detail unmounts the container (see
  // AGENTS.md "Dashboard container lifecycle"), and the term has to survive
  // that round-trip.
  search: string;
  onSearchChange: (q: string) => void;
  // "board" renders PortfolioKanbanView (bypasses pagination entirely,
  // groups every filtered+sorted row into its stage column) instead of the
  // paginated table. Wiring the actual toggle is a later task; this
  // container just needs to honor the prop.
  view?: "table" | "board";
  // False while a company detail is open on top of this container: page-client
  // keeps Portfolio mounted inside a display:none wrapper so its state
  // survives the round-trip (see AGENTS.md "Dashboard container lifecycle").
  // A hidden container must not answer keystrokes or measure zero-height DOM,
  // so this gates its own window listeners and the geometry effects below it.
  active?: boolean;
}

const DEFAULTS_KEY = "ud-v2-portfolio-default";

// Sort-key allowlist lives in portfolio-views.ts (shared with saved views)
// so a poisoned localStorage blob can't drop the UI into an unknown sort state.
const VALID_SIGNAL_KEYS: ReadonlySet<string> = new Set(PORTFOLIO_SIGNAL_ORDER);

function filterKey(filter: GlobalFilter): string {
  const ids = effectiveOwnerIds(filter);
  if (!ids) return "all";
  return [...ids].sort().join(",");
}

function loadDefaults(): PortfolioDefaults | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const f = parseFilter(JSON.stringify(parsed.filter));
    if (!f) return null;
    if (!Array.isArray(parsed.signals)) return null;
    if (typeof parsed.sort !== "string") return null;

    // Allowlist + length cap on signals so an injected localStorage blob
    // can't sneak in unknown keys, null, scripts, or 100k-element arrays
    // (adversarial QA caught all three).
    const cleanSignals: PortfolioSignalKey[] = (parsed.signals as unknown[])
      .filter((s): s is PortfolioSignalKey => typeof s === "string" && VALID_SIGNAL_KEYS.has(s))
      .slice(0, PORTFOLIO_SIGNAL_ORDER.length);

    // Allowlist sort key; fall back to the natural default on miss so a
    // typo / poisoned key can't leave the UI sorting on "·" placeholder.
    const sortKey: PortfolioSortKey = VALID_SORT_KEYS.has(parsed.sort as PortfolioSortKey)
      ? (parsed.sort as PortfolioSortKey)
      : "urgency";

    return { filter: f, signals: cleanSignals, sort: sortKey };
  } catch {
    return null;
  }
}

function saveDefaults(d: PortfolioDefaults): void {
  localStorage.setItem(
    DEFAULTS_KEY,
    JSON.stringify({ filter: JSON.parse(serializeFilter(d.filter)), signals: d.signals, sort: d.sort })
  );
}

export function PortfolioContainer({
  filter,
  filterLabel,
  showAvatar = true,
  onSelectCompany,
  search,
  onSearchChange,
  view = "table",
  active = true,
}: Props) {
  const [data, setData] = useState<PortfolioResponse | null>(null);

  // Report payload build time for the TopBar freshness label.
  useEffect(() => {
    reportFreshness("portfolio", data?.generatedAt);
  }, [data]);
  const [isFirstLoading, setIsFirstLoading] = useState(true);
  const [, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSignals, setSelectedSignals] = useState<PortfolioSignalKey[]>([]);
  const [stackedSignals, setStackedSignals] = useState(false);
  const [refine, setRefine] = useState<PortfolioRefineState>({});
  // Each entry is shown only when toggled on. Default = none → paused /
  // product hold / hibernation / snoozed rows are hidden from Portfolio.
  const [shownStatuses, setShownStatuses] = useState<PortfolioShownStatuses>({
    paused: false,
    product_hold: false,
    hibernation: false,
    snoozed: false,
  });
  const [sortKey, setSortKey] = useState<PortfolioSortKey>("urgency");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // Kanban column collapse state - board-view-only, but lives at the
  // container level (not PortfolioKanbanView) so it survives a table<->board
  // flip and can be captured into currentViewState for saved views.
  const [collapsedStages, setCollapsedStages] = useState<KanbanColumnKey[]>([]);
  const collapsedStagesSet = useMemo(() => new Set(collapsedStages), [collapsedStages]);
  // Toggling collapse changes which flat index each card owns (see
  // flattenBoard/flattenBoardOffsets in portfolio-kanban.ts), so a stale
  // focusedRowIndex could point at the wrong card, or one that's now hidden
  // inside a collapsed column. Simplest correct fix: clear it right here in
  // the handler rather than an effect (react-hooks/set-state-in-effect).
  const toggleColumnCollapsed = useCallback((key: KanbanColumnKey) => {
    setCollapsedStages((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    setFocusedRowIndex(null);
  }, []);

  // Snoozed companies live in localStorage (per device, see snoozed.ts).
  // Mount-only read + change-event subscription, same pattern as the saved
  // defaults below.
  const [snoozedList, setSnoozedList] = useState<SnoozedCompany[]>([]);
  useEffect(() => {
    setSnoozedList(getSnoozed());
    function onChange() {
      setSnoozedList(getSnoozed());
    }
    window.addEventListener("ud-snoozed-changed", onChange);
    return () => window.removeEventListener("ud-snoozed-changed", onChange);
  }, []);
  const snoozedIds = useMemo(
    () => new Set(snoozedList.map((e) => e.companyId)),
    [snoozedList]
  );
  const snoozeUntilById = useMemo(
    () => new Map(snoozedList.map((e) => [e.companyId, e.until])),
    [snoozedList]
  );

  // Click handler for sort selection. Re-clicking the active sort key flips
  // direction (asc↔desc); clicking a different key resets direction to that
  // option's natural default.
  const setSort = useCallback(
    (k: PortfolioSortKey) => {
      if (k === sortKey) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      const opt = getSortOptions(selectedSignals).find((o) => o.key === k);
      setSortKey(k);
      setSortDirection(opt?.direction ?? "desc");
    },
    [sortKey, selectedSignals]
  );

  const key = filterKey(filter);

  const dataRef = useRef<PortfolioResponse | null>(null);
  useEffect(() => { dataRef.current = data; });
  const inFlightRef = useRef(false);

  const fetchData = useCallback(
    async (refresh = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (dataRef.current === null) setIsFirstLoading(true);
      else setIsRevalidating(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (refresh) params.set("refresh", "true");
        if (key !== "all") params.set("ownerIds", key);
        const url = `/api/portfolio${params.toString() ? `?${params.toString()}` : ""}`;
        const res = await apiFetch(url);
        if (!res.ok) {
          setError(friendlyErrorMessage(null, res.status));
          return;
        }
        const json: PortfolioResponse = await res.json();
        setData(json);
      } catch (err) {
        setError(friendlyErrorMessage(err));
      } finally {
        setIsFirstLoading(false);
        setIsRevalidating(false);
        inFlightRef.current = false;
      }
    },
    [key]
  );

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    function onRefresh() { fetchData(true); }
    window.addEventListener("ud-refresh-dashboard", onRefresh);
    return () => window.removeEventListener("ud-refresh-dashboard", onRefresh);
  }, [fetchData]);

  // Loading and error states were silent to screen readers. The result-count
  // announce below covers "load finished successfully" implicitly (the new
  // count itself is the confirmation); these two cover the states it can't.
  useEffect(() => {
    if (isFirstLoading) announce("Loading accounts…");
  }, [isFirstLoading]);
  useEffect(() => {
    if (error) announce(`Couldn't refresh: ${error}`);
  }, [error]);

  const filteredSortedRows = useMemo<PortfolioRow[]>(() => {
    // Defensive default — adversarial QA caught a dashboard-wide crash when
    // an upstream payload returned `rows: null` or omitted the field. Coerce
    // here and downstream so a malformed response degrades to "empty list"
    // instead of "uncaught TypeError".
    const rawRows = Array.isArray(data?.rows) ? data!.rows : [];

    // Status visibility — by default we hide paused / product hold /
    // hibernation / snoozed rows. Each toggle adds one back in. Active rows
    // (dealStatus === null) always pass. Snooze is a parallel predicate, not
    // a dealStatus value — a company can be snoozed AND paused.
    const statusFiltered = rawRows.filter((r) => {
      if (snoozedIds.has(r.id) && shownStatuses.snoozed !== true) return false;
      if (!r.dealStatus) return true;
      return shownStatuses[r.dealStatus] === true;
    });

    // Territory scope. A territory owner's book is defined by company country
    // rather than ownership, so the fetch is unscoped and the narrowing happens
    // here. Rows with no country recorded fall outside every territory.
    const countries = effectiveCountries(filter);
    const inScope = countries
      ? statusFiltered.filter((r) => (r.companyCountry ? countries.has(r.companyCountry) : false))
      : statusFiltered;

    // Free-text narrowing on name / domain. Runs before the signal filter so
    // everything downstream (signal counts in view, sections, pagination,
    // board columns) operates on the searched set.
    const searched = inScope.filter((r) => matchesPortfolioSearch(r, search));

    const filtered = selectedSignals.length === 0
      ? searched
      : searched.filter((r) => {
          const sigs = Array.isArray(r.signals) ? r.signals : [];
          const matchedKinds = new Set<PortfolioSignalKey>();
          for (const s of sigs) {
            const k = mapKindToKey(s.kind, s.title);
            if (selectedSignals.includes(k)) matchedKinds.add(k);
          }
          if (matchedKinds.size === 0) return false;
          // Stacked mode: only surface rows that match 2+ of the
          // selected signal kinds. With a single kind selected the
          // toggle has no effect — same set as per-signal mode.
          if (stackedSignals && selectedSignals.length >= 2) {
            return matchedKinds.size >= 2;
          }
          return true;
        });

    // Refine post-filter. Universal axes apply unconditionally; per-signal
    // tighteners apply only when their signal is selected so they narrow,
    // never widen.
    const refined = filtered.filter((r) => {
      if (refine.acvMin != null && r.revenue < refine.acvMin) return false;
      if (refine.acvMax != null && r.revenue > refine.acvMax) return false;
      if (refine.daysInStageMin != null && (r.daysInStage ?? 0) < refine.daysInStageMin) return false;
      if (refine.daysInStageMax != null && (r.daysInStage ?? 0) > refine.daysInStageMax) return false;
      if (refine.stages && refine.stages.length > 0 && !refine.stages.includes(r.stage)) return false;
      if (refine.adoptionAfter && (!r.estimatedAdoptionDate || r.estimatedAdoptionDate < refine.adoptionAfter)) return false;
      if (refine.adoptionBefore && (!r.estimatedAdoptionDate || r.estimatedAdoptionDate > refine.adoptionBefore)) return false;
      if (selectedSignals.includes("gone_quiet") && refine.goneQuietMinDays != null) {
        if ((r.daysSilent ?? 0) < refine.goneQuietMinDays) return false;
      }
      if (selectedSignals.includes("health_dropped") && refine.healthMaxScore != null) {
        if (r.healthScore == null || r.healthScore > refine.healthMaxScore) return false;
      }
      if (selectedSignals.includes("stuck_in_step") && refine.stuckMinDaysPast != null) {
        if ((r.daysPastExpectedStep ?? 0) < refine.stuckMinDaysPast) return false;
      }
      if (selectedSignals.includes("overdue_invoices") && refine.overdueMinDays != null) {
        if ((r.overdueDays ?? 0) < refine.overdueMinDays) return false;
      }
      if (selectedSignals.includes("volume_declining") && refine.volumeMinDropPct != null) {
        if ((r.volumeDropPct ?? 0) < refine.volumeMinDropPct) return false;
      }
      return true;
    });

    const sortOpt = getSortOptions(selectedSignals).find((o) => o.key === sortKey);
    if (!sortOpt) return refined;
    const dir = sortDirection === "desc" ? -1 : 1;
    return [...refined].sort((a, b) => {
      const av = extractSortKey(a, sortKey);
      const bv = extractSortKey(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [data, filter, search, selectedSignals, stackedSignals, shownStatuses, snoozedIds, sortKey, sortDirection, refine]);

  // Board mode groups the full filtered+sorted set into stage columns and
  // bypasses pagination entirely (no PAGE_SIZE slice). boardFlatRows is the
  // column-major flattening (all rows of column 0, then column 1, ...) that
  // keyboard nav and PortfolioKanbanView both key focus off of.
  const boardColumns = useMemo<KanbanColumn[]>(
    () => groupByStage(filteredSortedRows),
    [filteredSortedRows]
  );
  const boardFlatRows = useMemo<PortfolioRow[]>(
    () => flattenBoard(boardColumns, collapsedStagesSet),
    [boardColumns, collapsedStagesSet]
  );

  // Accumulated ACV (EUR) of everything currently in view — the hero's
  // "portfolio value". row.revenue is amount_in_home_currency, already EUR.
  const portfolioValueEur = useMemo(
    () => filteredSortedRows.reduce((sum, r) => sum + (r.revenue || 0), 0),
    [filteredSortedRows]
  );

  // Snoozed count within the current scope — shown in the Status filter pill
  // so "Snoozed (3)" reflects this book, not the whole localStorage list.
  const snoozedCount = useMemo(() => {
    const rawRows = Array.isArray(data?.rows) ? data!.rows : [];
    let n = 0;
    for (const r of rawRows) if (snoozedIds.has(r.id)) n += 1;
    return n;
  }, [data, snoozedIds]);

  // Filter/refine/status changes silently swapped the whole result set with
  // no announcement. This also doubles as the "load finished" signal — the
  // count itself is the confirmation, so a separate "loaded" announce isn't
  // needed. Skipped during the first load so a stale "0 accounts" doesn't
  // fire before data arrives.
  useEffect(() => {
    if (isFirstLoading) return;
    const count = filteredSortedRows.length;
    const signalNote = selectedSignals.length > 0
      ? `, filtered to ${selectedSignals.map((k) => PORTFOLIO_SIGNAL_MAP[k]?.label ?? k).join(", ")}`
      : "";
    const searchNote = search.trim() ? ` matching "${search.trim()}"` : "";
    announce(`${count} account${count === 1 ? "" : "s"}${searchNote}${signalNote}`);
  }, [filteredSortedRows.length, search, selectedSignals, isFirstLoading]);

  // Reset to page 1 whenever filter/signal/sort context changes. Following
  // the prev-X "adjust state during render" pattern the strict react-hooks
  // lint expects, convergent because the equality check stops firing once
  // page is 1 and the signature stabilizes. Kept to its pre-board-mode
  // composition (no `view`) so filter/signal/sort changes keep their
  // existing table-mode behavior untouched.
  const pageResetSig = `${key}|${search}|${selectedSignals.join(",")}|${sortKey}|${sortDirection}`;
  const [prevPageResetSig, setPrevPageResetSig] = useState(pageResetSig);
  if (prevPageResetSig !== pageResetSig) {
    setPrevPageResetSig(pageResetSig);
    setPage(1);
  }

  // Board and table order rows differently (paginated list order vs.
  // column-major board order), so a focusedRowIndex carried over from one
  // mode could land on an unrelated row/card in the other. This is its own
  // adjust-during-render slot, separate from pageResetSig above, so the
  // reset fires only on an actual view flip, not on every filter/signal/
  // sort change. Page itself is left untouched on a view flip: board mode
  // has no pagination to preserve, and flipping back to table with the old
  // page intact is harmless, so there's no need to also reset it here.
  const [prevView, setPrevView] = useState(view);
  if (prevView !== view) {
    setPrevView(view);
    setFocusedRowIndex(null);
  }

  const totalPages = Math.max(1, Math.ceil(filteredSortedRows.length / PAGE_SIZE));
  // Defensive clamp — if data refresh shrinks the row count below the
  // current page boundary, render the last available page rather than an
  // empty slice. setPage isn't called here; the next user action will sync.
  const effectivePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(
    () => filteredSortedRows.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
    [filteredSortedRows, effectivePage]
  );

  // Event-handler state read via a single ref so the listener-attach effect
  // doesn't have to re-bind on every selectedSignals/sortKey/filter change.
  // Previously each of those changes torn down and re-attached six window
  // listeners. The refs pattern keeps the listeners stable for the
  // component's lifetime while still letting them read current state.
  // Keyboard nav uses `activeFlatRows`: `paginatedRows` in table mode so
  // ↑/↓ bounds and ↵-to-open both operate within the current page,
  // `boardFlatRows` in board mode so the same nav walks every column in
  // column-major order instead.
  const activeFlatRows = view === "board" ? boardFlatRows : paginatedRows;
  const stateRef = useRef({
    rows: activeFlatRows,
    focused: focusedRowIndex,
    selectedSignals,
    sortKey,
    filter,
    onSelectCompany,
    view,
    boardColumns,
    collapsedStages: collapsedStagesSet,
  });
  useEffect(() => {
    stateRef.current = {
      rows: activeFlatRows,
      focused: focusedRowIndex,
      selectedSignals,
      sortKey,
      filter,
      onSelectCompany,
      view,
      boardColumns,
      collapsedStages: collapsedStagesSet,
    };
  });

  useEffect(() => {
    function onNav(e: Event) {
      const direction = (e as CustomEvent<"prev" | "next">).detail;
      const { rows, focused } = stateRef.current;
      if (rows.length === 0) return;
      const next = focused == null
        ? 0
        : direction === "next"
          ? Math.min(focused + 1, rows.length - 1)
          : Math.max(focused - 1, 0);
      setFocusedRowIndex(next);
    }
    function onOpen() {
      const { rows, focused, onSelectCompany: select } = stateRef.current;
      if (focused == null || !rows[focused]) return;
      select(rows[focused].id);
    }
    function onSignalToggle(e: Event) {
      const idx = (e as CustomEvent<number>).detail;
      const k = PORTFOLIO_SIGNAL_ORDER[idx];
      if (!k) return;
      setSelectedSignals((prev) =>
        prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]
      );
    }
    function onSignalClear() { setSelectedSignals([]); }
    function onSortCycle() {
      const { selectedSignals: sigs, sortKey: currentSort } = stateRef.current;
      const opts = getSortOptions(sigs);
      const idx = opts.findIndex((o) => o.key === currentSort);
      const next = opts[(idx + 1) % opts.length];
      if (next) {
        // Cycle key + reset direction to the new option's natural default.
        setSortKey(next.key);
        setSortDirection(next.direction);
      }
    }
    function onSaveDefaults() {
      const { filter: f, selectedSignals: sigs, sortKey: sk } = stateRef.current;
      saveDefaults({ filter: f, signals: sigs, sort: sk });
      // Mirror the prop-callback: flip hasSavedDefault so "Reset to default"
      // becomes available immediately after a Cmd+S save.
      setHasSavedDefault(true);
    }
    // Board-only: jump focus to the first row of the previous/next
    // non-empty column relative to whichever column the focused card is
    // currently in. With no focus yet, land on the first card overall.
    // Table mode ignores the event entirely (page.tsx / a later task owns
    // which physical key dispatches it).
    function onKanbanColumnJump(e: Event) {
      const { view: activeView, boardColumns: cols, focused, collapsedStages: collapsed } = stateRef.current;
      if (activeView !== "board") return;
      const detail = (e as CustomEvent<{ dir: -1 | 1 }>).detail;
      if (!detail || cols.length === 0) return;
      const { dir } = detail;

      // Shared with boardFlatRows/PortfolioKanbanView's flatIndexOf so a
      // collapsed column contributes zero flat-index slots here too.
      const offsets = flattenBoardOffsets(cols, collapsed);
      const isJumpable = (i: number) => cols[i].rows.length > 0 && !collapsed.has(cols[i].def.key);

      if (focused == null) {
        const firstNonEmpty = cols.findIndex((_, i) => isJumpable(i));
        if (firstNonEmpty === -1) return;
        setFocusedRowIndex(offsets[firstNonEmpty]);
        return;
      }

      let curCol = -1;
      for (let i = 0; i < cols.length; i++) {
        if (collapsed.has(cols[i].def.key)) continue;
        if (focused >= offsets[i] && focused < offsets[i] + cols[i].rows.length) {
          curCol = i;
          break;
        }
      }
      if (curCol === -1) return;

      let nextCol = curCol + dir;
      while (nextCol >= 0 && nextCol < cols.length && !isJumpable(nextCol)) {
        nextCol += dir;
      }
      if (nextCol < 0 || nextCol >= cols.length) return;
      setFocusedRowIndex(offsets[nextCol]);
    }

    window.addEventListener("ud-list-nav", onNav);
    window.addEventListener("ud-list-open", onOpen);
    window.addEventListener("ud-portfolio-signal-toggle", onSignalToggle);
    window.addEventListener("ud-portfolio-signal-clear", onSignalClear);
    window.addEventListener("ud-portfolio-sort-cycle", onSortCycle);
    window.addEventListener("ud-portfolio-save-defaults", onSaveDefaults);
    window.addEventListener("ud-kanban-column-jump", onKanbanColumnJump);
    return () => {
      window.removeEventListener("ud-list-nav", onNav);
      window.removeEventListener("ud-list-open", onOpen);
      window.removeEventListener("ud-portfolio-signal-toggle", onSignalToggle);
      window.removeEventListener("ud-portfolio-signal-clear", onSignalClear);
      window.removeEventListener("ud-portfolio-sort-cycle", onSortCycle);
      window.removeEventListener("ud-portfolio-save-defaults", onSaveDefaults);
      window.removeEventListener("ud-kanban-column-jump", onKanbanColumnJump);
    };
  }, []);

  const [hasSavedDefault, setHasSavedDefault] = useState(false);
  useEffect(() => {
    // A default saved view (starred in the Views pill) supersedes the legacy
    // Cmd+S signals+sort default — it restores the full toolbar state.
    const defView = getDefaultSavedView();
    if (defView) {
      setSelectedSignals(defView.state.signals);
      setStackedSignals(defView.state.stackedSignals);
      setRefine(defView.state.refine);
      setShownStatuses(defView.state.shownStatuses);
      setSortKey(defView.state.sortKey);
      setSortDirection(defView.state.sortDirection);
      setHasSavedDefault(loadDefaults() != null);
      return;
    }
    const d = loadDefaults();
    if (d) {
      setSelectedSignals(d.signals);
      setSortKey(d.sort);
      // Direction isn't persisted; restore the option's natural default.
      const opt = getSortOptions(d.signals).find((o) => o.key === d.sort);
      setSortDirection(opt?.direction ?? "desc");
      setHasSavedDefault(true);
    }
  }, []);

  // Page navigation scrolls back to the top of the page so the user always
  // lands above the new row slice (otherwise switching from the bottom
  // pagination drops them mid-list with the next-page rows below the fold).
  const onPageChange = useCallback((next: number) => {
    setPage(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  // Keyboard shortcuts for page nav: `[` previous, `]` next. Gated on
  // (a) no input focused — so the jump-to-page input still receives raw
  // keys, and (b) no portfolio popover open — so brackets don't shift the
  // page out from under a user navigating the filter or sort menu.
  //
  // Layout note: on Danish and Swedish keyboards, `[` and `]` are typed
  // with AltGr+8 / AltGr+9 respectively. AltGr surfaces in JS as
  // `altKey: true`. Bailing on altKey would silently kill the shortcut for
  // those users, so we only bail on Cmd/Ctrl (which would mean an explicit
  // system or browser shortcut like Cmd+[ = browser back). e.key already
  // resolves to the actual character produced by the layout, so the same
  // check works for US keyboards (bare `[`) and Nordic keyboards (AltGr+8).
  const popupOpenRef = useRef(false);
  useEffect(() => {
    function onPopupState(e: Event) {
      popupOpenRef.current = (e as CustomEvent<boolean>).detail === true;
    }
    window.addEventListener("ud-portfolio-popup-state", onPopupState);
    return () =>
      window.removeEventListener("ud-portfolio-popup-state", onPopupState);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Pagination doesn't exist in board mode (no PAGE_SIZE slice, no
      // Pagination control rendered) - leave `[`/`]` untouched there so a
      // later task can repurpose them (e.g. column jump) without this
      // handler eating the keydown first.
      if (view === "board") return;
      // A company detail is open on top of us; keys belong to it, not to the
      // hidden list underneath.
      if (!active) return;
      if (e.metaKey || e.ctrlKey) return;
      if (popupOpenRef.current) return;
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inInput) return;

      if (e.key === "[") {
        if (page > 1) onPageChange(page - 1);
        e.preventDefault();
      } else if (e.key === "]") {
        const tp = Math.max(1, Math.ceil(filteredSortedRows.length / PAGE_SIZE));
        if (page < tp) onPageChange(page + 1);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, onPageChange, filteredSortedRows.length, view, active]);

  // When a filter is active, the global totalsBySignal payload (which
  // counts the entire book) misrepresents the current scope. Recompute
  // counts over the filtered rows so the banner breakdown stays honest.
  const totalsBySignal = useMemo<Record<PortfolioSignalKey, number>>(() => {
    const empty: Record<PortfolioSignalKey, number> = {
      overdue_invoices: 0, open_invoices: 0, no_future_events: 0, health_dropped: 0,
      stuck_in_step: 0, volume_declining: 0, wish_to_churn: 0, gone_quiet: 0,
      not_on_pay: 0,
    };
    // Unfiltered: the API-provided totals are the right answer. Anything that
    // narrows the set client-side has to disqualify this shortcut, or the
    // headline reads "8 customers" while the breakdown underneath still
    // reports the whole book's 147/130/42. That is true of a search term, and
    // of a country-scoped filter (a territory owner or Spain), whose payload
    // is deliberately the unscoped one.
    const narrowsClientSide = search.trim() !== "" || effectiveCountries(filter) !== null;
    if (selectedSignals.length === 0 && !narrowsClientSide) {
      return data?.totalsBySignal ?? empty;
    }
    // Narrowed: tally distinct signals across filteredSortedRows.
    const counts = { ...empty };
    for (const row of filteredSortedRows) {
      const sigs = Array.isArray(row.signals) ? row.signals : [];
      for (const s of sigs) {
        const k = mapKindToKey(s.kind, s.title);
        counts[k] += 1;
      }
    }
    return counts;
  }, [data, filter, search, selectedSignals, filteredSortedRows]);

  // Stable callback so the memoized Row stays cheap. A fresh closure each
  // render would defeat React.memo on the row component.
  const onRowClick = useCallback(
    (row: PortfolioRow) => onSelectCompany(row.id),
    [onSelectCompany]
  );

  const toggleSignal = useCallback(
    (k: PortfolioSignalKey) =>
      setSelectedSignals((prev) =>
        prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]
      ),
    []
  );
  const clearSignals = useCallback(() => setSelectedSignals([]), []);

  // Saved views: apply restores the full toolbar state in one go; the
  // current snapshot is what "Save current view" persists.
  const applyView = useCallback((state: PortfolioViewState) => {
    setSelectedSignals(state.signals);
    setStackedSignals(state.stackedSignals);
    setRefine(state.refine);
    setShownStatuses(state.shownStatuses);
    setSortKey(state.sortKey);
    setSortDirection(state.sortDirection);
    // Already sanitized against the KANBAN_COLUMNS allowlist in
    // portfolio-views.ts, so this is a known-good KanbanColumnKey[].
    setCollapsedStages(state.collapsedStages as KanbanColumnKey[]);
    // Applying a view can change signals/refine/sort/collapsedStages all at
    // once, reshuffling the flat row list (table and board both). A stale
    // focusedRowIndex would then resolve to a different, unrelated company,
    // so Enter would open the wrong account. Clear synchronously here, same
    // as toggleColumnCollapsed does above.
    setFocusedRowIndex(null);
  }, []);
  const currentViewState = useMemo<PortfolioViewState>(
    () => ({
      signals: selectedSignals,
      stackedSignals,
      refine,
      shownStatuses,
      sortKey,
      sortDirection,
      collapsedStages,
    }),
    [selectedSignals, stackedSignals, refine, shownStatuses, sortKey, sortDirection, collapsedStages]
  );

  // Snooze actions — stable callbacks so the memoized Row stays cheap. The
  // ud-snoozed-changed listener above pulls the new list back into state.
  const onSnoozeCompany = useCallback((companyId: string, until: number) => {
    snoozeCompany(companyId, until);
  }, []);
  const onUnsnoozeCompany = useCallback((companyId: string) => {
    unsnoozeCompany(companyId);
  }, []);

  const onResetDefaults = useCallback(() => {
    const d = loadDefaults();
    if (!d) return;
    setSelectedSignals(d.signals);
    setSortKey(d.sort);
    const opt = getSortOptions(d.signals).find((o) => o.key === d.sort);
    setSortDirection(opt?.direction ?? "desc");
  }, []);

  if (error && !data) return <div style={{ padding: 24 }}>{error}</div>;
  if (isFirstLoading) return <PortfolioSkeleton />;
  if (!data) return null;

  return (
    <ErrorBoundary
      label="PortfolioContainer"
      fallback={(reset) => (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
          <span style={{ color: "var(--rust)", fontSize: 14 }}>
            Could not render the portfolio. The data may be in an unexpected shape.
          </span>
          <button
            onClick={reset}
            style={{
              background: "var(--moss)",
              color: "var(--page-bg)",
              padding: "8px 14px",
              borderRadius: 8,
              border: 0,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      )}
    >
      {error && data && (
        <div
          role="status"
          style={{
            background: "color-mix(in oklch, var(--rust) 14%, transparent)",
            color: "var(--rust)",
            padding: "8px 28px",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 500,
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          Refresh failed: {error}. Showing cached data.
        </div>
      )}
      <div key={view} className="view-fade">
      {view === "board" ? (
        <PortfolioKanbanView
          rows={filteredSortedRows}
          nowIso={data?.generatedAt ?? new Date().toISOString()}
          totalRowCount={filteredSortedRows.length}
          totalsBySignal={totalsBySignal}
          globalTotalsBySignal={data?.totalsBySignal ?? totalsBySignal}
          filterLabel={filterLabel}
          showAvatar={showAvatar}
          search={search}
          onSearchChange={onSearchChange}
          selectedSignals={selectedSignals}
          toggleSignal={toggleSignal}
          clearSignals={clearSignals}
          stackedSignals={stackedSignals}
          toggleStackedSignals={() => setStackedSignals((v) => !v)}
          refine={refine}
          setRefine={setRefine}
          shownStatuses={shownStatuses}
          toggleStatus={(s) =>
            setShownStatuses((prev) => ({ ...prev, [s]: !prev[s] }))
          }
          snoozedCount={snoozedCount}
          snoozeUntilById={snoozeUntilById}
          onSnoozeCompany={onSnoozeCompany}
          onUnsnoozeCompany={onUnsnoozeCompany}
          currentViewState={currentViewState}
          onApplyView={applyView}
          portfolioValueEur={portfolioValueEur}
          sortKey={sortKey}
          sortDirection={sortDirection}
          setSortKey={setSort}
          focusedRowIndex={focusedRowIndex}
          onRowClick={onRowClick}
          hasSavedDefault={hasSavedDefault}
          defaultsAreCurrent={isCurrentEqualToSaved(filter, selectedSignals, sortKey)}
          onResetDefaults={onResetDefaults}
          collapsedStages={collapsedStagesSet}
          toggleColumnCollapsed={toggleColumnCollapsed}
          active={active}
        />
      ) : (
        <PortfolioView
          rows={paginatedRows}
          totalRowCount={filteredSortedRows.length}
          totalsBySignal={totalsBySignal}
          globalTotalsBySignal={data?.totalsBySignal ?? totalsBySignal}
          filterLabel={filterLabel}
          showAvatar={showAvatar}
          search={search}
          onSearchChange={onSearchChange}
          selectedSignals={selectedSignals}
          toggleSignal={toggleSignal}
          clearSignals={clearSignals}
          stackedSignals={stackedSignals}
          toggleStackedSignals={() => setStackedSignals((v) => !v)}
          refine={refine}
          setRefine={setRefine}
          shownStatuses={shownStatuses}
          toggleStatus={(s) =>
            setShownStatuses((prev) => ({ ...prev, [s]: !prev[s] }))
          }
          snoozedCount={snoozedCount}
          snoozeUntilById={snoozeUntilById}
          onSnoozeCompany={onSnoozeCompany}
          onUnsnoozeCompany={onUnsnoozeCompany}
          currentViewState={currentViewState}
          onApplyView={applyView}
          portfolioValueEur={portfolioValueEur}
          sortKey={sortKey}
          sortDirection={sortDirection}
          setSortKey={setSort}
          focusedRowIndex={focusedRowIndex}
          onRowClick={onRowClick}
          hasSavedDefault={hasSavedDefault}
          defaultsAreCurrent={isCurrentEqualToSaved(filter, selectedSignals, sortKey)}
          onResetDefaults={onResetDefaults}
          page={effectivePage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          onPageChange={onPageChange}
          active={active}
        />
      )}
      </div>
    </ErrorBoundary>
  );
}

function isCurrentEqualToSaved(
  filter: GlobalFilter,
  signals: PortfolioSignalKey[],
  sort: PortfolioSortKey
): boolean {
  const saved = loadDefaults();
  if (!saved) return false;
  if (serializeFilter(saved.filter) !== serializeFilter(filter)) return false;
  if (saved.sort !== sort) return false;
  if (saved.signals.length !== signals.length) return false;
  const a = [...saved.signals].sort();
  const b = [...signals].sort();
  return a.every((v, i) => v === b[i]);
}

function PortfolioSkeleton() {
  // Mirrors the live Portfolio shape: moss banner + toolbar pills + column
  // header + 8 placeholder rows. animate-pulse comes from Tailwind utilities
  // already in globals.css.
  return (
    <div style={{ background: "var(--page-bg)", minHeight: "calc(100vh - 120px)" }}>
      <div className="page-gutter" style={{ paddingTop: 20 }}>
        <div
          className="animate-pulse page-max"
          style={{
            background: "var(--moss)",
            borderRadius: 18,
            height: 154,
            opacity: 0.85,
          }}
        />
      </div>
      <div className="animate-pulse page-gutter" style={{ paddingBottom: 60 }}>
        <div className="page-max">
          <div style={{ display: "flex", gap: 10, padding: "12px 0" }}>
            <div style={{ height: 36, width: 180, background: "var(--hairline)", borderRadius: 10 }} />
            <div style={{ flex: 1 }} />
            <div style={{ height: 36, width: 180, background: "var(--hairline)", borderRadius: 10 }} />
          </div>
          <div
            style={{
              height: 36,
              background: "var(--card-bg)",
              border: "1px solid var(--hairline)",
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              marginBottom: 0,
            }}
          />
          <div
            style={{
              height: 32,
              background: "var(--card-bg)",
              borderLeft: "1px solid var(--hairline)",
              borderRight: "1px solid var(--hairline)",
              borderBottom: "1px solid var(--hairline-strong)",
            }}
          />
          <div
            style={{
              border: "1px solid var(--hairline)",
              borderTop: 0,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              overflow: "hidden",
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: COLS_GRID_WITH_OWNER,
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 18px",
                  borderBottom: i === 7 ? "none" : "1px solid var(--hairline)",
                }}
              >
                <span style={{ height: 18, background: "var(--hairline)", borderRadius: 6 }} />
                <span style={{ height: 14, background: "var(--hairline)", borderRadius: 4, width: "70%" }} />
                <span style={{ height: 16, background: "var(--hairline)", borderRadius: 6, width: "55%" }} />
                <span aria-hidden />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 28 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 50 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 30 }} />
                <span style={{ height: 22, width: 22, background: "var(--hairline)", borderRadius: "50%", justifySelf: "end" }} />
                <span style={{ height: 24, background: "var(--hairline)", borderRadius: 6, justifySelf: "end", width: 120 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

