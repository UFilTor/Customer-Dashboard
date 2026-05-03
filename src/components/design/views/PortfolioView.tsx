"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import type { PortfolioRow, PortfolioSignalKey, PortfolioSortKey } from "@/lib/types";
import { PORTFOLIO_SIGNALS, PORTFOLIO_SIGNAL_MAP, PORTFOLIO_SIGNAL_ORDER } from "@/lib/signals";
import { getSortOptions, mapKindToKey } from "@/lib/portfolio";
import { signalStyle, pillText, calmCopy } from "@/lib/signal-display";
import { OWNER_MAP } from "@/lib/owners";
import { Avatar } from "../Avatar";
import { DashboardBanner } from "../DashboardBanner";
import { EditorialEmpty } from "../EditorialEmpty";

interface Props {
  // The slice of rows for the current page (already filtered + sorted by
  // the container). Section grouping happens here, downstream of the slice,
  // so a row that matches multiple selected signals lands in its highest-
  // priority signal section without duplication.
  rows: PortfolioRow[];
  // Full filtered+sorted row count across all pages. Used by the results
  // bar caption and the pagination math. Container computes this from the
  // pre-pagination list.
  totalRowCount: number;
  totalsBySignal: Record<PortfolioSignalKey, number>;

  // Filter scope label rendered as a banner-eyebrow tail ("Portfolio · Filip's
  // book"). Null/undefined drops the tail and the eyebrow reads "Portfolio".
  filterLabel?: string | null;

  // When false (typically a person filter), the OWNER column is dropped from
  // the grid because every row would show the same avatar.
  showAvatar?: boolean;

  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (key: PortfolioSignalKey) => void;
  clearSignals: () => void;

  sortKey: PortfolioSortKey;
  // Current sort direction; column-header arrows + sort-dropdown active marker
  // reflect this. Toggling is owned by the parent's setSortKey: re-clicking
  // the active key flips direction, clicking a new key resets to that option's
  // natural default.
  sortDirection: "asc" | "desc";
  setSortKey: (k: PortfolioSortKey) => void;

  focusedRowIndex: number | null;
  onRowClick: (row: PortfolioRow) => void;

  hasSavedDefault: boolean;
  defaultsAreCurrent: boolean;
  onSaveDefaults: () => void;
  onResetDefaults: () => void;

  // Pagination. Top + bottom selectors share this state; bottom mirror lets
  // a user who scrolled to the end switch pages without scrolling back up.
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (next: number) => void;
}

// One item in the rendered list. Plain rows when one (or zero) signals are
// selected; rows interleaved with section headers when 2+ signals are
// selected so the eye scans by category like the old Status By-signal view.
type ListItem =
  | { kind: "row"; row: PortfolioRow; index: number; key: string }
  | { kind: "section-header"; signal: PortfolioSignalKey; count: number; key: string };

// Stage chip palette. Action stages keep a distinct color so the eye finds
// accounts CS needs to touch; healthy steady-state stages collapse to a
// shared neutral beige chip so they glide past without competing for the
// retina the way the rust severity pills do.
const STAGE_BADGE: Record<PortfolioRow["stage"], { bg: string; fg: string }> = {
  Onboarding:  { bg: "var(--stage-onboarding-bg)", fg: "var(--stage-onboarding-fg)" },
  // Started lives next to a rust signal pill on most rows. Sky-blue keeps
  // "brand new" visible without painting red-on-red.
  Started:     { bg: "var(--sky-blue)",            fg: "var(--moss)" },
  // Healthy steady-state trio: identical neutral chip. Stage column should
  // not pull attention when nothing is wrong.
  Adopted:     { bg: "var(--beige)",               fg: "var(--moss)" },
  "Ramp Up":   { bg: "var(--beige)",               fg: "var(--moss)" },
  Established: { bg: "var(--beige)",               fg: "var(--moss)" },
};

// Universal sort keys that map to clickable column headers.
const COL_SORT_MAP: Partial<Record<string, PortfolioSortKey>> = {
  stage: "stage",
  name: "name",
  health: "health",
  revenue: "revenue",
  last_contact: "last_contact",
};

// Column grid for header + rows. Two variants based on `showAvatar`:
//
//   STAGE 96 · ACCOUNT clamp · SIGNALS 280 · 1fr spacer · HEALTH 60 · REVENUE 80 · LAST 50 · OWNER 44
//   STAGE 96 · ACCOUNT clamp · SIGNALS 280 · 1fr spacer · HEALTH 60 · REVENUE 80 · LAST 50
//
// ACCOUNT is now a clamped column (220px-360px) instead of a 1fr stretch so
// signals sit close to the account name instead of being pushed to the
// middle. The leftover slack absorbs into a dedicated 1fr spacer between
// signals and the right cluster (HEALTH/REVENUE/LAST/OWNER), keeping that
// cluster pinned to the row's right edge.
const COLS_GRID_WITH_OWNER = "96px minmax(220px, 360px) 280px 1fr 60px 80px 50px 44px";
const COLS_GRID_NO_OWNER   = "96px minmax(220px, 360px) 280px 1fr 60px 80px 50px";

export function PortfolioView(props: Props) {
  const showAvatar = props.showAvatar ?? true;
  const sortOptions = getSortOptions(props.selectedSignals);

  const pageRowCount = props.rows.length;

  // Stable row-click handler so memo'd Row stays cheap. Parent already passes
  // a referentially stable onRowClick (useCallback in PortfolioContainer).
  const onSelect = props.onRowClick;
  const { rows, focusedRowIndex, selectedSignals } = props;

  // When 2+ signals are selected, group rows into sections so the eye scans
  // by signal category like the old Status By-signal Kanban. Single-signal
  // (and unfiltered) views stay flat — sectioning would be redundant chrome.
  // Tiebreak rule for rows that match multiple selected signals: place each
  // row in its highest-priority matching signal's section (priority follows
  // PORTFOLIO_SIGNAL_ORDER, which is the keyboard 1-8 order). No dup.
  const items = useMemo<ListItem[]>(() => {
    if (selectedSignals.length < 2) {
      return rows.map((row, i) => ({ kind: "row", row, index: i, key: row.id }));
    }
    // Group preserving the parent's sort order within each section.
    const grouped = new Map<PortfolioSignalKey, { row: PortfolioRow; index: number }[]>();
    rows.forEach((row, i) => {
      const sigs = Array.isArray(row.signals) ? row.signals : [];
      const rowKeys = new Set(sigs.map((s) => mapKindToKey(s.kind, s.title)));
      let placedKey: PortfolioSignalKey | null = null;
      for (const k of PORTFOLIO_SIGNAL_ORDER) {
        if (selectedSignals.includes(k) && rowKeys.has(k)) {
          placedKey = k;
          break;
        }
      }
      // Defensive fallback for rows whose kind doesn't surface in any
      // selected signal (shouldn't happen given the container's filter,
      // but keeps a malformed row visible instead of dropping it silently).
      if (!placedKey) placedKey = selectedSignals[0];
      if (!grouped.has(placedKey)) grouped.set(placedKey, []);
      grouped.get(placedKey)!.push({ row, index: i });
    });

    const out: ListItem[] = [];
    for (const sig of PORTFOLIO_SIGNAL_ORDER) {
      const sectionRows = grouped.get(sig);
      if (!sectionRows || sectionRows.length === 0) continue;
      out.push({
        kind: "section-header",
        signal: sig,
        count: sectionRows.length,
        key: `header-${sig}`,
      });
      sectionRows.forEach(({ row, index }) => {
        out.push({ kind: "row", row, index, key: row.id });
      });
    }
    return out;
  }, [rows, selectedSignals]);

  // Virtualize the items (rows + section headers) so DOM stays bounded.
  // estimateSize is per-index so headers (~36px) and rows (~50px) get the
  // right initial layout before measureElement refines.
  //
  // The strict `react-hooks/refs` lint forbids reading `.current` during
  // render, so we capture the list's page-offset via a callback ref into
  // state instead of reading from a ref.
  const [listOffsetTop, setListOffsetTop] = useState(0);
  const measureList = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    setListOffsetTop(node.getBoundingClientRect().top + window.scrollY);
  }, []);
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (i) => (items[i]?.kind === "section-header" ? 36 : 50),
    overscan: 8,
    scrollMargin: listOffsetTop,
  });

  // Keep the focused row in view when keyboard nav moves outside the viewport.
  // focusedRowIndex is over `rows` (the page slice) — translate to items
  // index so virtualizer.scrollToIndex lands on the correct virtual item.
  useEffect(() => {
    if (focusedRowIndex == null) return;
    const itemIndex = items.findIndex(
      (it) => it.kind === "row" && it.index === focusedRowIndex
    );
    if (itemIndex < 0) return;
    virtualizer.scrollToIndex(itemIndex, { align: "auto" });
  }, [focusedRowIndex, items, virtualizer]);

  // Sticky section header. When sectioning is active, track which section
  // is currently visible and pin its header just below the column-headers
  // strip so the user always knows what category they're scrolling through.
  // Tracking is rAF-throttled to keep scroll cheap; the inline section
  // headers in the row list also still render so the user sees boundaries
  // when crossing into a new section.
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState<{
    sig: PortfolioSignalKey;
    count: number;
  } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // A 1px sentinel placed just above the sticky strip. While the sentinel is
  // in the viewport the strip hasn't pinned yet → no shadow. The instant the
  // sentinel scrolls out, the strip is pinned → flip on the shadow. This is
  // more reliable than reading bbox.top across various layouts/topbars.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    // When sectioning is off, the listener is simply not attached. The
    // render guard `selectedSignals.length >= 2 && activeSection` prevents
    // any stale state from showing, so we don't need to clear it here.
    if (selectedSignals.length < 2) return;
    let raf = 0;

    function compute() {
      raf = 0;
      // Cursor = absolute Y of the row position just below the sticky strip.
      // measurementsCache[i].start is in absolute (document) coords because
      // useWindowVirtualizer is configured with scrollMargin: listOffsetTop —
      // so we compare against an absolute cursor too. Earlier versions of
      // this code subtracted listOffsetTop from cursor, which made the
      // comparison list-relative vs absolute and the loop never matched.
      const stickyHeight = stickyRef.current?.offsetHeight ?? 200;
      const cursor = window.scrollY + stickyHeight;

      // Read MEASURED offsets from the virtualizer, not fixed estimates.
      // Row heights vary (rows with vs. without secondary detail lines),
      // so cumulative estimates drift further the deeper you scroll.
      const measurements = virtualizer.measurementsCache;
      // Find the section whose ROWS are currently under the sticky strip.
      // We track the most recent section-header at/above the cursor — so as
      // soon as a section's first row is in view (header may still be partly
      // visible), the indicator already announces the section. Without this,
      // the indicator only appeared after scrolling 36px past the inline
      // header, leaving a dead zone where users saw rows with no label.
      let last: { sig: PortfolioSignalKey; count: number } | null = null;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const m = measurements[i];
        if (!m) break;
        if (item.kind === "section-header" && m.start <= cursor) {
          last = { sig: item.signal, count: item.count };
        }
        if (m.start > cursor) break;
      }
      setActiveSection((prev) => {
        // Only update when the section actually changed — avoids a re-render
        // every scroll frame.
        if (prev?.sig === last?.sig && prev?.count === last?.count) return prev;
        return last;
      });
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(compute);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    compute();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [selectedSignals.length, items, listOffsetTop, virtualizer]);

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const scrollOffset = virtualizer.options.scrollMargin;

  // Range labels for the results bar: "Showing 1-50 of 774 accounts".
  // First and last 1-based row positions on the current page.
  const firstOnPage = props.totalRowCount === 0
    ? 0
    : (props.page - 1) * props.pageSize + 1;
  const lastOnPage = Math.min(props.page * props.pageSize, props.totalRowCount);
  const isPaginated = props.totalPages > 1;

  return (
    <div style={{ background: "var(--page-bg)", minHeight: "calc(100vh - 120px)" }}>
      <Banner
        totalRows={props.totalRowCount}
        totalsBySignal={props.totalsBySignal}
        filterLabel={props.filterLabel ?? null}
        selectedSignals={props.selectedSignals}
        toggleSignal={props.toggleSignal}
      />

      <div style={{ padding: "0 28px 60px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, marginBottom: -1 }} />
          <div className={`pf-sticky${scrolled ? " scrolled" : ""}`} ref={stickyRef}>
            <Toolbar
              selectedSignals={props.selectedSignals}
              toggleSignal={props.toggleSignal}
              clearSignals={props.clearSignals}
              totalsBySignal={props.totalsBySignal}
              sortKey={props.sortKey}
              sortDirection={props.sortDirection}
              setSortKey={props.setSortKey}
              sortOptions={sortOptions}
              page={props.page}
              totalPages={props.totalPages}
              onPageChange={props.onPageChange}
              firstOnPage={firstOnPage}
              lastOnPage={lastOnPage}
              totalRowCount={props.totalRowCount}
              isPaginated={isPaginated}
              hasSavedDefault={props.hasSavedDefault}
              defaultsAreCurrent={props.defaultsAreCurrent}
              onSaveDefaults={props.onSaveDefaults}
              onResetDefaults={props.onResetDefaults}
            />
            <ColumnHeaders
              sortKey={props.sortKey}
              sortDirection={props.sortDirection}
              setSortKey={props.setSortKey}
              showAvatar={showAvatar}
            />
            {/* Sticky indicator for the section currently being scrolled
                through. Renders only when sectioning is active (2+ signals
                selected) and a section is visible in the row list. */}
            {selectedSignals.length >= 2 && activeSection && (
              <SectionHeader
                signal={activeSection.sig}
                count={activeSection.count}
              />
            )}
          </div>

          <div
            ref={measureList}
            style={{
              background: "var(--card-bg)",
              border: "1px solid var(--hairline)",
              borderTop: 0,
              borderRadius: 0,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              overflow: "hidden",
            }}
          >
            {pageRowCount === 0 ? (
              <EditorialEmpty
                headline="No accounts match."
                caption="Try removing a filter or clearing your search."
              />
            ) : (
              <div
                style={{
                  height: totalSize,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const item = items[virtualRow.index];
                  if (!item) return null;
                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start - scrollOffset}px)`,
                      }}
                    >
                      {item.kind === "section-header" ? (
                        <SectionHeader signal={item.signal} count={item.count} />
                      ) : (
                        <Row
                          row={item.row}
                          focused={focusedRowIndex === item.index}
                          onSelect={onSelect}
                          isLast={item.index === pageRowCount - 1}
                          showAvatar={showAvatar}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ---------- Editorial banner ----------

function Banner({
  totalRows,
  totalsBySignal,
  filterLabel,
  selectedSignals,
  toggleSignal,
}: {
  totalRows: number;
  totalsBySignal: Record<PortfolioSignalKey, number>;
  filterLabel: string | null;
  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (k: PortfolioSignalKey) => void;
}) {
  const eyebrow = filterLabel ? `Portfolio · ${filterLabel}` : "Portfolio";

  if (totalRows === 0) {
    return (
      <DashboardBanner
        eyebrow={eyebrow}
        maxWidth={1200}
        headline={<>No accounts in scope.</>}
        detail={<>Try a different filter to widen the search.</>}
      />
    );
  }

  // Categorical breakdown of the four bad-severity signal counts. We dropped
  // the single "X urgent" total because at scale (53% of book) the word
  // stopped meaning anything; per-category counts let the eye find the
  // cluster that matters today and skip past quiet days entirely. Sorted
  // descending so the heaviest category lands first (left-to-right reading
  // order = priority order); same-style fragments rely on position alone to
  // rank because making the top number bigger competed with the headline.
  // Each fragment doubles as a one-click filter into the matching signal.
  // Replaces the current selection (clear + set) so the eye lands on the
  // group it just clicked instead of stacking onto an unrelated filter.
  const breakdown: Array<{ count: number; label: string; signal: PortfolioSignalKey }> = [
    { count: totalsBySignal.overdue_invoices, label: "overdue",       signal: "overdue_invoices" as PortfolioSignalKey },
    { count: totalsBySignal.wish_to_churn,    label: "wish to churn", signal: "wish_to_churn" as PortfolioSignalKey },
    { count: totalsBySignal.volume_declining, label: "volume drops",  signal: "volume_declining" as PortfolioSignalKey },
    { count: totalsBySignal.no_future_events, label: "no events",     signal: "no_future_events" as PortfolioSignalKey },
  ]
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  // Multi-select toggle, identical to the dropdown rows. Avoids silently
  // wiping a user's existing 3-signal filter set when they click a banner
  // fragment to focus on something else; instead the click adds/removes
  // the signal from the current selection like every other filter affordance.
  const applyFragment = (sig: PortfolioSignalKey) => {
    toggleSignal(sig);
  };

  return (
    <DashboardBanner
      eyebrow={eyebrow}
      maxWidth={1200}
      headline={
        <>
          {totalRows} {totalRows === 1 ? "customer" : "customers"} across your book.
        </>
      }
      detail={
        breakdown.length === 0 ? (
          <>Nothing flagged today.</>
        ) : (
          <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "baseline" }}>
            {breakdown.map((item, i) => {
              const active = selectedSignals.includes(item.signal);
              return (
                <span key={item.label} style={{ whiteSpace: "nowrap" }}>
                  {i > 0 && (
                    <span aria-hidden="true" style={{ opacity: 0.45, padding: "0 8px" }}>·</span>
                  )}
                  <button
                    type="button"
                    className={`pf-banner-frag${active ? " active" : ""}`}
                    onClick={() => applyFragment(item.signal)}
                    aria-pressed={active}
                    aria-label={`Filter to ${item.count} ${item.label}`}
                    style={{ padding: "1px 6px" }}
                  >
                    <span style={{ fontWeight: 600 }}>{item.count}</span> {item.label}
                  </button>
                </span>
              );
            })}
          </span>
        )
      }
    />
  );
}

// ---------- Toolbar (filter + sort triggers) ----------

interface ToolbarProps {
  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (k: PortfolioSignalKey) => void;
  clearSignals: () => void;
  totalsBySignal: Record<PortfolioSignalKey, number>;
  sortKey: PortfolioSortKey;
  sortDirection: "asc" | "desc";
  setSortKey: (k: PortfolioSortKey) => void;
  sortOptions: ReturnType<typeof getSortOptions>;
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  // Status / view-default controls absorbed from the (now removed) ResultsBar.
  // Folding these into the toolbar collapses the sticky chrome stack from four
  // bands to three, so the data area starts ~40px earlier on every viewport.
  firstOnPage: number;
  lastOnPage: number;
  totalRowCount: number;
  isPaginated: boolean;
  hasSavedDefault: boolean;
  defaultsAreCurrent: boolean;
  onSaveDefaults: () => void;
  onResetDefaults: () => void;
}

function Toolbar({
  selectedSignals,
  toggleSignal,
  clearSignals,
  totalsBySignal,
  sortKey,
  sortDirection,
  setSortKey,
  sortOptions,
  page,
  totalPages,
  onPageChange,
  firstOnPage,
  lastOnPage,
  totalRowCount,
  isPaginated,
  hasSavedDefault,
  defaultsAreCurrent,
  onSaveDefaults,
  onResetDefaults,
}: ToolbarProps) {
  const isFiltered = selectedSignals.length > 0;
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useOutsideClose(filterRef, filterOpen, () => setFilterOpen(false));
  useOutsideClose(sortRef, sortOpen, () => setSortOpen(false));

  // Mirror open-state to page-client so the page-level ↑/↓/Enter list-nav
  // yields to the popup while one is open.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-portfolio-popup-state", { detail: filterOpen || sortOpen })
    );
  }, [filterOpen, sortOpen]);

  // Local Shift+F / Shift+S handlers to mirror the kbd hints shown in the
  // trigger pills. Doesn't conflict with the page-level S (sort cycle) or
  // Cmd+S (save defaults) because we gate on shiftKey + !meta + !ctrl.
  // Escape dismisses whichever dropdown is open so keyboard users can back
  // out without round-tripping through the toggle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inInput =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "Escape" && (filterOpen || sortOpen)) {
        setFilterOpen(false);
        setSortOpen(false);
        e.preventDefault();
        return;
      }

      if (inInput) return;
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "F" || e.key === "f") {
        setFilterOpen((v) => !v);
        setSortOpen(false);
        e.preventDefault();
      } else if (e.key === "S" || e.key === "s") {
        setSortOpen((v) => !v);
        setFilterOpen(false);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterOpen, sortOpen]);

  const filterLabel =
    selectedSignals.length === 0
      ? "All"
      : selectedSignals.length === 1
        ? PORTFOLIO_SIGNAL_MAP[selectedSignals[0]]?.label
        : `${selectedSignals.length} selected`;

  const sortLabel = sortOptions.find((o) => o.key === sortKey)?.label ?? "·";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        background: "var(--page-bg)",
        padding: "12px 0",
      }}
    >
      <div ref={filterRef} style={{ position: "relative" }}>
        <button
          onClick={() => {
            setFilterOpen((v) => !v);
            setSortOpen(false);
          }}
          style={pillTriggerStyle(selectedSignals.length > 0)}
        >
          <span style={eyebrowStyle}>Signals</span>
          <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{filterLabel}</span>
          <span className="kbd">⇧F</span>
          <Caret open={filterOpen} />
        </button>
        {filterOpen && (
          <FilterDropdown
            selectedSignals={selectedSignals}
            toggleSignal={toggleSignal}
            clearSignals={clearSignals}
            totalsBySignal={totalsBySignal}
            onClose={() => setFilterOpen(false)}
          />
        )}
      </div>

      <span
        aria-live="polite"
        aria-atomic="true"
        style={{
          fontSize: 12,
          color: "var(--green-100)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {isPaginated ? (
          <>
            <strong style={{ color: "var(--moss)", fontWeight: 600 }}>
              {firstOnPage}–{lastOnPage}
            </strong>
            <span>of</span>
            <strong style={{ color: "var(--moss)", fontWeight: 600 }}>
              {totalRowCount}
            </strong>
            <span>{totalRowCount === 1 ? "account" : "accounts"}</span>
          </>
        ) : (
          <>
            <strong style={{ color: "var(--moss)", fontWeight: 600 }}>
              {totalRowCount}
            </strong>
            <span>{totalRowCount === 1 ? "account" : "accounts"}</span>
          </>
        )}
        {isFiltered && <span style={{ opacity: 0.65 }}>· filtered</span>}
      </span>

      {/* Pagination sits next to the count on the left so the row reads as
          "where am I in the data" all together. The flex spacer pushes the
          state-affecting controls (Clear / Reset / Save / Sort) to the right. */}
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      )}

      <span style={{ flex: 1 }} />

      {isFiltered && (
        <button onClick={clearSignals} style={ghostBtnStyle}>
          Clear filters
        </button>
      )}
      {hasSavedDefault && !defaultsAreCurrent && (
        <button onClick={onResetDefaults} style={ghostBtnStyle}>
          Reset to default
        </button>
      )}
      <button
        onClick={onSaveDefaults}
        title={hasSavedDefault ? "Update saved default" : "Save current state as default"}
        style={ghostBtnStyle}
      >
        <span className={`pf-star${hasSavedDefault ? " on" : ""}`}>
          {hasSavedDefault ? "★" : "☆"}
        </span>
        <span>{hasSavedDefault ? "Saved" : "Save view"}</span>
        <span className="kbd" style={{ marginLeft: 2 }}>⌘S</span>
      </button>

      <div ref={sortRef} style={{ position: "relative" }}>
        <button
          onClick={() => {
            setSortOpen((v) => !v);
            setFilterOpen(false);
          }}
          style={pillTriggerStyle(false)}
        >
          <span style={eyebrowStyle}>Sort</span>
          <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{sortLabel}</span>
          <span className="kbd">⇧S</span>
          <Caret open={sortOpen} />
        </button>
        {sortOpen && (
          <SortDropdown
            sortKey={sortKey}
            sortDirection={sortDirection}
            sortOptions={sortOptions}
            setSortKey={setSortKey}
            onClose={() => setSortOpen(false)}
            anchorRight
          />
        )}
      </div>
    </div>
  );
}

// ---------- Filter dropdown ----------

function FilterDropdown({
  selectedSignals,
  toggleSignal,
  clearSignals,
  totalsBySignal,
  onClose,
}: {
  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (k: PortfolioSignalKey) => void;
  clearSignals: () => void;
  totalsBySignal: Record<PortfolioSignalKey, number>;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [focusedIdx, setFocusedIdx] = useState(() => {
    const firstSelected = PORTFOLIO_SIGNALS.findIndex((m) => selectedSignals.includes(m.key));
    return firstSelected >= 0 ? firstSelected : 0;
  });

  // Move native focus to whichever row is at focusedIdx so the visible focus
  // ring + screen-reader cue follow keyboard nav.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const buttons = list.querySelectorAll<HTMLButtonElement>("button.pf-pop-row");
    buttons[focusedIdx]?.focus();
  }, [focusedIdx]);

  // Local ↑↓/Space/Enter handler. Space toggles the focused signal (multi-
  // select), Enter replaces selection with only the focused signal and closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        setFocusedIdx((i) => Math.min(i + 1, PORTFOLIO_SIGNALS.length - 1));
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        setFocusedIdx((i) => Math.max(i - 1, 0));
        e.preventDefault();
      } else if (e.key === " ") {
        const k = PORTFOLIO_SIGNALS[focusedIdx]?.key;
        if (k) toggleSignal(k);
        e.preventDefault();
      } else if (e.key === "Enter") {
        const k = PORTFOLIO_SIGNALS[focusedIdx]?.key;
        if (k) {
          // Replace selection with only the focused signal. clearSignals +
          // toggleSignal in one event get batched so the queued result is [k].
          clearSignals();
          toggleSignal(k);
        }
        onClose();
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedIdx, toggleSignal, clearSignals, onClose]);

  return (
    <div
      className="pf-pop"
      style={{
        left: 0,
        // Cap width on narrow viewports so the popup doesn't overlap account
        // names in the column to the right at 1280px.
        width: 280,
        maxWidth: "calc(100vw - 80px)",
      }}
    >
      {/* Eyebrow alone is enough header chrome here. The italic helper that
          used to live below ("Multi-select. Press 1-8 to toggle.") was a
          third Fraunces use per viewport and a misleading scope cue (numbers
          fire globally, not popover-scoped) — the per-row kbd badges next to
          each signal already advertise the binding. */}
      <div style={{ padding: "12px 20px 8px", borderBottom: "1px solid var(--hairline)" }}>
        <div style={eyebrowStyle}>Filter by signal</div>
      </div>
      <div ref={listRef} style={{ padding: 6, maxHeight: 420, overflowY: "auto" }}>
        {PORTFOLIO_SIGNALS.map((meta, i) => {
          const isOn = selectedSignals.includes(meta.key);
          const count = totalsBySignal[meta.key] ?? 0;
          return (
            <button
              key={meta.key}
              onClick={() => toggleSignal(meta.key)}
              className={`pf-pop-row${isOn ? " selected" : ""}`}
            >
              <span className={`pf-checkbox${isOn ? " on" : ""}`}>
                {isOn && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M3 6.5L5 8.5L9 4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: meta.color,
                  flex: "0 0 auto",
                }}
              />
              <span style={{ flex: 1 }}>{meta.label}</span>
              <span
                style={{
                  fontSize: 13,
                  color: "var(--green-100)",
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 500,
                  marginRight: 4,
                }}
              >
                {count}
              </span>
              <span className="pf-num-badge">{i + 1}</span>
            </button>
          );
        })}
      </div>
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--hairline)",
          display: "flex",
          gap: 14,
          fontSize: 11,
          color: "var(--green-100)",
          alignItems: "center",
        }}
      >
        <span>
          <span className="kbd">↑↓</span> nav
        </span>
        <span>
          <span className="kbd">space</span> toggle
        </span>
        <span style={{ marginLeft: "auto" }}>
          <button
            onClick={clearSignals}
            style={{
              background: "transparent",
              color: "var(--moss)",
              fontSize: 12,
              fontWeight: 600,
              padding: "5px 8px",
              borderRadius: 6,
              cursor: "pointer",
              border: 0,
            }}
          >
            Clear all
          </button>
        </span>
      </div>
    </div>
  );
}

// ---------- Sort dropdown ----------

function SortDropdown({
  sortKey,
  sortDirection,
  sortOptions,
  setSortKey,
  onClose,
  anchorRight,
}: {
  sortKey: PortfolioSortKey;
  sortDirection: "asc" | "desc";
  sortOptions: ReturnType<typeof getSortOptions>;
  setSortKey: (k: PortfolioSortKey) => void;
  onClose: () => void;
  anchorRight?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [focusedIdx, setFocusedIdx] = useState(() => {
    const idx = sortOptions.findIndex((o) => o.key === sortKey);
    return idx >= 0 ? idx : 0;
  });

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const buttons = list.querySelectorAll<HTMLButtonElement>("button.pf-pop-row");
    buttons[focusedIdx]?.focus();
  }, [focusedIdx]);

  // Space follows the focused row: if it's already the active sort, flip
  // direction (a-z ↔ z-a); otherwise apply that sort. Either way the popup
  // stays open so the user can keep tweaking. Enter applies the focused sort
  // and closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        setFocusedIdx((i) => Math.min(i + 1, sortOptions.length - 1));
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        setFocusedIdx((i) => Math.max(i - 1, 0));
        e.preventDefault();
      } else if (e.key === " ") {
        const k = sortOptions[focusedIdx]?.key;
        if (k) setSortKey(k);
        e.preventDefault();
      } else if (e.key === "Enter") {
        const k = sortOptions[focusedIdx]?.key;
        if (k) setSortKey(k);
        onClose();
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedIdx, sortOptions, setSortKey, onClose]);

  return (
    <div
      className="pf-pop"
      style={{ ...(anchorRight ? { right: 0 } : { left: 0 }), minWidth: 200 }}
    >
      <div style={{ padding: "12px 20px 8px", borderBottom: "1px solid var(--hairline)" }}>
        <div style={eyebrowStyle}>Sort by</div>
      </div>
      <div ref={listRef} style={{ padding: 6, maxHeight: 420, overflowY: "auto" }}>
        {sortOptions.map((o) => {
          const on = o.key === sortKey;
          return (
            <button
              key={o.key}
              onClick={() => {
                setSortKey(o.key);
                // Mouse click on a different sort closes the menu; clicking
                // the active sort flips direction and stays open.
                if (!on) onClose();
              }}
              title={on ? "Click again to flip direction" : undefined}
              className={`pf-pop-row${on ? " selected" : ""}`}
            >
              <span
                style={{
                  width: 18,
                  color: "var(--moss)",
                  fontSize: 13,
                  fontWeight: 700,
                  textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {on ? (sortDirection === "desc" ? "↓" : "↑") : ""}
              </span>
              <span style={{ flex: 1 }}>{o.label}</span>
            </button>
          );
        })}
      </div>
      {/* Mirrors the FilterDropdown footer so both popovers teach the same
          surface. Recognition over recall: the in-popover hint announces
          space flips direction without the user having to discover it. */}
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--hairline)",
          display: "flex",
          gap: 14,
          fontSize: 11,
          color: "var(--green-100)",
          alignItems: "center",
        }}
      >
        <span>
          <span className="kbd">↑↓</span> nav
        </span>
        <span>
          <span className="kbd">↵</span> apply
        </span>
        <span>
          <span className="kbd">space</span> apply/flip
        </span>
      </div>
    </div>
  );
}

// ---------- Column headers ----------

function ColumnHeaders({
  sortKey,
  sortDirection,
  setSortKey,
  showAvatar,
}: {
  sortKey: PortfolioSortKey;
  sortDirection: "asc" | "desc";
  setSortKey: (k: PortfolioSortKey) => void;
  showAvatar: boolean;
}) {
  function header(label: string, col: string, align: "start" | "end" = "start") {
    const target = COL_SORT_MAP[col];
    const sorted = target && sortKey === target;
    const ariaSort: "ascending" | "descending" | "none" | undefined = target
      ? sorted
        ? (sortDirection === "desc" ? "descending" : "ascending")
        : "none"
      : undefined;
    if (!target) {
      return (
        <span
          role="columnheader"
          style={{ ...eyebrowStyle, justifySelf: align === "end" ? "end" : "start" }}
        >
          {label}
        </span>
      );
    }
    // Direction-aware arrow on the active column; bidirectional ↕ on inactive
    // sortable columns to advertise that a click sorts.
    const arrow = sorted ? (sortDirection === "desc" ? "↓" : "↑") : "↕";
    return (
      <span role="columnheader" aria-sort={ariaSort} style={{ justifySelf: align === "end" ? "end" : "start", display: "inline-flex" }}>
        <button
          onClick={() => setSortKey(target)}
          title={sorted ? "Click again to flip direction" : `Sort by ${label.toLowerCase()}`}
          className={`pf-col-head${sorted ? " sorted" : ""}`}
        >
          <span>{label}</span>
          <span className="arrow" aria-hidden="true">{arrow}</span>
        </button>
      </span>
    );
  }
  return (
    <div
      role="row"
      style={{
        display: "grid",
        gridTemplateColumns: showAvatar ? COLS_GRID_WITH_OWNER : COLS_GRID_NO_OWNER,
        gap: 12,
        // Now the cap of the list (ResultsBar removed). Tightened y-padding
        // because there's no longer a tonal step above to read against.
        padding: "11px 18px 9px",
        background: "var(--card-bg)",
        border: "1px solid var(--hairline)",
        borderBottom: "1px solid var(--hairline-strong)",
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
      }}
    >
      {header("Stage", "stage")}
      {header("Account", "name")}
      <span role="columnheader" style={eyebrowStyle}>Signals</span>
      {/* 1fr spacer between Signals and the right-aligned numeric cluster. */}
      <span aria-hidden="true" />
      {header("Health", "health", "end")}
      {header("Revenue", "revenue", "end")}
      {header("Last", "last_contact", "end")}
      {showAvatar && (
        <span role="columnheader" style={{ ...eyebrowStyle, justifySelf: "end" }}>Owner</span>
      )}
    </div>
  );
}

// ---------- Row ----------

// Wrapped in React.memo because Portfolio renders this hundreds of times.
// `onSelect` is taken as a stable callback (parent useCallbacks it) so the
// memoization stays effective when filter/sort/focused state changes around
// the list. Without memoization an arrow-key focus shift re-renders all
// rendered rows; with memo + stable callback, only the previously-focused
// and newly-focused rows re-render.
const Row = memo(function Row({
  row,
  focused,
  onSelect,
  isLast,
  showAvatar,
}: {
  row: PortfolioRow;
  focused: boolean;
  onSelect: (row: PortfolioRow) => void;
  isLast: boolean;
  showAvatar: boolean;
}) {
  const stage = STAGE_BADGE[row.stage];
  // Defensive default — adversarial QA caught a crash when an upstream
  // payload returned `signals: null`. Coerce here so a malformed row doesn't
  // tear the whole list down.
  const safeSignals = Array.isArray(row.signals) ? row.signals : [];
  // Pull the stuck-in-step signal (Onboarding only) for the secondary text
  // line so the days-in-step figure shows in BOTH the row's metadata header
  // AND its Signals column — same dual-surface treatment Meeting Prep gives
  // its lifecycle deals (header copy + WatchOutFor card).
  const stuckSignal = safeSignals.find((s) => s.kind === "stuck_in_step");
  const stuckDetail = stuckSignal
    ? `${stuckSignal.title} · ${stuckSignal.detail}`
    : null;
  const firstDetail = safeSignals[0]?.detail;
  // Health number is exact, so the column doesn't need to encode severity in
  // color too. Keeping rust on the row's signal pill as the single severity
  // moment per row; weak scores read in the muted green-100 to drop back.
  const healthColor =
    row.healthScore == null
      ? "var(--green-100)"
      : row.healthScore >= 65
        ? "var(--moss)"
        : "var(--green-100)";

  // Resolve to an OwnerLike for the shared Avatar. Falls back to a synthetic
  // { name } if the row carries an ownerName but no canonical map entry, so
  // the initial still renders.
  const owner = row.ownerId ? OWNER_MAP[row.ownerId] : null;
  const ownerForAvatar = owner ?? (row.ownerName ? { name: row.ownerName } : null);

  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className={`pf-row${focused ? " focused" : ""}`}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: showAvatar ? COLS_GRID_WITH_OWNER : COLS_GRID_NO_OWNER,
        gap: 12,
        alignItems: "center",
        width: "100%",
        padding: "12px 18px",
        border: "none",
        borderBottom: isLast ? "none" : "1px solid var(--hairline)",
        background: "transparent",
        color: "inherit",
        font: "inherit",
        textAlign: "left",
        cursor: "pointer",
        // DESIGN.md "13px Floor": body type sits at 13. Numeric cells
        // (Health, Revenue, Last) don't set their own fontSize, so set the
        // row default here instead of letting them inherit body's ~16px.
        fontSize: 13,
      }}
    >
      <span
        style={{
          padding: "4px 10px",
          borderRadius: 6,
          background: stage.bg,
          color: stage.fg,
          // DESIGN.md "Label" type: Inter 700, 10px, +0.06em uppercase. Keeps
          // row chrome in Inter; Oswald is reserved for display moments.
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          lineHeight: 1.2,
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {row.stage}
      </span>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            // Match the peer convention (BriefingView, SplitView): 500 by
            // default, 600 only when the row is focused/active. Painting every
            // row at 600 makes the table read as if every row is selected.
            fontWeight: focused ? 600 : 500,
            color: "var(--moss)",
            letterSpacing: "-0.005em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {row.name}
        </div>
        {(stuckDetail || firstDetail || row.domain) && (
          <div
            style={{
              fontSize: 12,
              color: "var(--green-100)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {/* Onboarding rows promote stuck-in-step to the secondary line so
                the "Xd in step (expected Y)" reads at the same altitude as
                Meeting Prep's header. Other stages fall back to the loudest
                signal's detail; if none, the company domain. */}
            {stuckDetail ?? firstDetail ?? row.domain}
          </div>
        )}
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          justifySelf: "start",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {/* Signals cell — content rendered inline; the 1fr spacer column
            after this cell absorbs leftover row width. */}
        {safeSignals.length === 0 ? (
          <CalmGlyph stage={row.stage} />
        ) : (
          <>
            {/* Equal-weight rendering: every signal gets its own pill with
                severity-appropriate treatment (bad = solid rust fill, warn =
                hairline rust border). Capped at 3 inline + "+N more" so the
                Signals column stays one row tall at 280px. Mirrors the
                Meeting Prep WatchOutFor behaviour (each signal a card) within
                the table-row constraint. */}
            {safeSignals.slice(0, 3).map((s, i) => (
              <SignalPill
                key={`${s.kind}:${i}`}
                kind={s.kind}
                title={s.title}
                severity={s.severity}
              />
            ))}
            {safeSignals.length > 3 && (
              <span
                title={safeSignals.slice(3).map((s) => s.title).join(" · ")}
                style={{
                  fontSize: 10,
                  color: "var(--green-100)",
                  fontWeight: 600,
                  paddingLeft: 2,
                }}
              >
                +{safeSignals.length - 3}
              </span>
            )}
          </>
        )}
      </div>

      {/* 1fr spacer to push the numeric cluster to the row's right edge. */}
      <span aria-hidden="true" />

      <span
        style={{
          color: healthColor,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          textAlign: "right",
          justifySelf: "end",
        }}
      >
        {row.healthScore == null ? "·" : Math.round(row.healthScore)}
      </span>

      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          color: "var(--moss)",
          fontWeight: 500,
          justifySelf: "end",
        }}
      >
        {row.revenue ? `€${formatNum(row.revenue)}` : "·"}
      </span>

      <span
        style={{
          color: "var(--green-100)",
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          justifySelf: "end",
        }}
      >
        {row.daysSinceContact == null ? "·" : `${row.daysSinceContact}d`}
      </span>

      {showAvatar && (
        <span style={{ justifySelf: "end" }}>
          <Avatar owner={ownerForAvatar} size={22} />
        </span>
      )}
    </button>
  );
});

// ---------- Stage-dependent calm glyph ----------

// Stage colours the "no signals" state: an Onboarding row with nothing flagged
// reads differently from an Established row with nothing flagged. Glyph stays
// minimal (matches Health/Revenue/Last null treatment); the title carries the
// stage-specific reading for screen readers and tooltip-on-hover.
function CalmGlyph({ stage }: { stage: PortfolioRow["stage"] }) {
  const label = calmCopy(stage, "glyph");
  return (
    <span
      title={label}
      aria-label={label}
      style={{ fontSize: 13, color: "var(--green-100)", fontWeight: 500 }}
    >
      ·
    </span>
  );
}

// ---------- Signal pill ----------

function SignalPill({
  kind,
  title,
  severity,
}: {
  kind: string;
  title: string;
  severity: "bad" | "warn";
}) {
  // Open invoice is the special case: its WatchOutSignal kind is reused from
  // overdue_invoice but the pill should read as warn (open != overdue).
  // signal-display.ts treats severity as the source of truth, so we compute
  // the effective severity here before delegating.
  const isOpenInvoice = title === "Open invoice";
  const effectiveSeverity = isOpenInvoice ? "warn" : severity;
  const tokens = signalStyle(effectiveSeverity);
  const text = pillText({ kind, title, severity, detail: "" } as never);

  return (
    <span
      title={title}
      aria-label={title}
      style={{
        background: tokens.bg,
        color: tokens.fg,
        border: `1px solid ${tokens.border}`,
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        padding: "1px 7px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 180,
        display: "inline-block",
        lineHeight: 1.4,
      }}
    >
      {text}
    </span>
  );
}

// Empty state now uses the shared <EditorialEmpty /> primitive so wording
// and rhythm stay consistent with Briefing, Onboarding, and the detail pane.

// ---------- helpers ----------

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

function useOutsideClose(
  ref: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  close: () => void
) {
  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    // pointerdown covers mouse + touch + pen in one listener (iOS Safari
    // doesn't fire mousedown for outside-tap dismissal reliably).
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open, close, ref]);
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", opacity: 0.7 }}
    >
      <path
        d="M2 3.5L5 6.5L8 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// DESIGN.md "Label" type: Inter 700 10px +0.06em UPPERCASE. Don't reach for
// var(--font-display) here — Oswald is reserved for actual numerical hero
// moments; using it for every eyebrow drains its display weight.
const eyebrowStyle: CSSProperties = {
  textTransform: "uppercase",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  color: "var(--green-100)",
};

function pillTriggerStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "var(--card-bg)",
    border: `1px solid ${active ? "var(--moss)" : "var(--hairline)"}`,
    color: "var(--moss)",
    // Peer chip / pill labels sit at 12px so the trigger reads as inline
    // chrome rather than a body-size element. Don't add `font: inherit` here:
    // the shorthand resets font-size to the inherited value (~16px from body)
    // and silently overrides this fontSize. Family already inherits via
    // `button { font-family: inherit }` in globals.css.
    fontSize: 12,
    lineHeight: 1,
    padding: "8px 14px",
    // Match the TopBar pills + cards radius family (10-14px). The reference
    // shape is a soft rectangle, not a capsule.
    borderRadius: 10,
    cursor: "pointer",
    transition: "border-color 120ms var(--ease-out), background 120ms var(--ease-out)",
  };
}

const ghostBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  color: "var(--green-100)",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  padding: "3px 6px",
  borderRadius: 6,
  border: 0,
  cursor: "pointer",
};

// ---------- Pagination ----------

// Top + bottom selectors share the same component and the same page state,
// so a user who scrolled to the end of a page never has to scroll back to
// the top to switch — the bottom selector mirrors the top one. Style follows
// the Filter / Sort pill pattern (card-bg, hairline border, 10px radius)
// so the toolbar reads as one consistent strip of chrome.
//
// The "Page X of Y" label is clickable: a single click swaps it for a
// numeric input so a user can jump straight to a page rather than chevron-
// stepping through 16 of them. Enter applies the typed page; Escape /
// blur cancels back to the label without changing the current page.
function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
}) {
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + select-all when entering edit mode so the user can immediately
  // type the target page without manually clearing the field.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed.length > 0) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed)) {
        const clamped = Math.max(1, Math.min(totalPages, parsed));
        if (clamped !== page) onPageChange(clamped);
      }
    }
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  const navBtnStyle: CSSProperties = {
    background: "transparent",
    border: 0,
    fontFamily: "inherit",
    fontSize: 14,
    color: "var(--moss)",
    lineHeight: 1,
    padding: "0 4px",
    minWidth: 16,
  };
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "var(--card-bg)",
        border: "1px solid var(--hairline)",
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 12,
        lineHeight: 1,
        color: "var(--moss)",
      }}
    >
      <button
        type="button"
        aria-label="Previous page"
        aria-disabled={!canPrev}
        onClick={() => canPrev && onPageChange(page - 1)}
        style={{
          ...navBtnStyle,
          cursor: canPrev ? "pointer" : "default",
          // 0.45 keeps ≥3:1 against the cream pill background so a focus ring
          // landing on a disabled button still passes WCAG 1.4.11.
          opacity: canPrev ? 1 : 0.45,
        }}
      >
        ‹
      </button>
      {editing ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          <span>Page</span>
          <input
            ref={inputRef}
            // type=text + inputMode=numeric avoids the native number-input
            // spinner arrows (which can't be styled cleanly across browsers
            // and clash with the calm pill chrome). Validation happens in
            // commitDraft via parseInt + clamp.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={draft}
            maxLength={String(totalPages).length}
            onChange={(e) => {
              // Strip non-digits so the field never accepts garbage.
              const cleaned = e.target.value.replace(/[^0-9]/g, "");
              setDraft(cleaned);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelEdit();
              }
            }}
            onBlur={commitDraft}
            aria-label={`Jump to page (1 to ${totalPages})`}
            style={{
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--moss)",
              background: "var(--page-bg)",
              border: "1px solid var(--hairline-strong)",
              borderRadius: 6,
              padding: "3px 8px",
              // Width fits the largest page number with breathing room.
              width: `${Math.max(36, String(totalPages).length * 8 + 20)}px`,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
              outline: "none",
              lineHeight: 1.2,
            }}
          />
          <span>of {totalPages}</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(String(page));
            setEditing(true);
          }}
          aria-label={`Page ${page} of ${totalPages}. Click to jump to a specific page.`}
          title="Jump to page"
          style={{
            background: "transparent",
            border: 0,
            fontFamily: "inherit",
            fontSize: 12,
            color: "var(--moss)",
            cursor: "pointer",
            padding: "2px 4px",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            lineHeight: 1,
          }}
        >
          Page <strong style={{ fontWeight: 600 }}>{page}</strong> of{" "}
          <strong style={{ fontWeight: 600 }}>{totalPages}</strong>
        </button>
      )}
      <button
        type="button"
        aria-label="Next page"
        aria-disabled={!canNext}
        onClick={() => canNext && onPageChange(page + 1)}
        style={{
          ...navBtnStyle,
          cursor: canNext ? "pointer" : "default",
          opacity: canNext ? 1 : 0.45,
        }}
      >
        ›
      </button>
    </div>
  );
}

// ---------- Section header (multi-signal grouping) ----------

// Rendered between row groups when 2+ signals are selected. Echoes the
// signal's brand color via a 6px leading dot, the signal's full label,
// and the count in this section. Keeps the column-grid alignment by
// occupying its own pseudo-row above the rows it groups.
function SectionHeader({
  signal,
  count,
}: {
  signal: PortfolioSignalKey;
  count: number;
}) {
  const meta = PORTFOLIO_SIGNAL_MAP[signal];
  return (
    <h3
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px 8px",
        background: "var(--card-bg)",
        borderBottom: "1px solid var(--hairline)",
        margin: 0,
        fontWeight: 400,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: meta?.color ?? "var(--green-100)",
          flex: "0 0 auto",
        }}
      />
      <span style={eyebrowStyle}>{meta?.label ?? signal}</span>
      <span style={{ flex: 1 }} />
      <span
        style={{
          fontSize: 11,
          color: "var(--green-100)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 500,
        }}
      >
        {count}
      </span>
    </h3>
  );
}
