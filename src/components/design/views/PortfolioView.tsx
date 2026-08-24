"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type PortfolioRefineState, type PortfolioRow, type PortfolioSignalKey, type PortfolioSortKey } from "@/lib/types";
import { PORTFOLIO_SIGNAL_ORDER } from "@/lib/signals";
import { getSortOptions, mapKindToKey } from "@/lib/portfolio";
import { type PortfolioShownStatuses, type PortfolioViewState } from "@/lib/portfolio-views";
import { EditorialEmpty } from "../EditorialEmpty";
import { Banner } from "./portfolio/Banner";
import { ColumnHeaders, SectionHeader } from "./portfolio/ColumnHeaders";
import { Pagination } from "./portfolio/Pagination";
import { Row } from "./portfolio/PortfolioRow";
import { Toolbar } from "./portfolio/Toolbar";

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
  // Book-wide totals, never filtered. Drives the FilterDropdown counts so
  // the user always sees how many accounts each signal would surface
  // regardless of the current selection (e.g. Health drop always reads "216"
  // even while another signal is the active filter).
  globalTotalsBySignal: Record<PortfolioSignalKey, number>;

  // Filter scope label rendered as a banner-eyebrow tail ("Portfolio · Filip's
  // book"). Null/undefined drops the tail and the eyebrow reads "Portfolio".
  filterLabel?: string | null;

  // When false (typically a person filter), the OWNER column is dropped from
  // the grid because every row would show the same avatar.
  showAvatar?: boolean;

  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (key: PortfolioSignalKey) => void;
  clearSignals: () => void;
  stackedSignals: boolean;
  toggleStackedSignals: () => void;
  refine: PortfolioRefineState;
  setRefine: (next: PortfolioRefineState | ((prev: PortfolioRefineState) => PortfolioRefineState)) => void;
  shownStatuses: PortfolioShownStatuses;
  toggleStatus: (s: keyof PortfolioShownStatuses) => void;

  // Snooze — hidden-by-default rows the user parked. Count feeds the Status
  // pill label; the until-map drives the row tag when snoozed rows are shown.
  snoozedCount: number;
  snoozeUntilById: Map<string, number>;
  onSnoozeCompany: (companyId: string, until: number) => void;
  onUnsnoozeCompany: (companyId: string) => void;

  // Saved views (ViewsPill). currentViewState is what "Save current view"
  // captures; onApplyView restores a saved snapshot in one go.
  currentViewState: PortfolioViewState;
  onApplyView: (state: PortfolioViewState) => void;

  // Accumulated ACV (EUR) of the current filtered set, for the banner.
  portfolioValueEur: number;

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
  onResetDefaults: () => void;

  // Pagination state. Page nav lives below the list (only when totalPages > 1);
  // page slice + range caption use these props at the top.
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

  // Pages are capped at 50 rows (PAGE_SIZE in PortfolioContainer) — cheap
  // enough to render in full. This view used to virtualize with
  // useWindowVirtualizer, but that traded a real maintenance cost (three
  // documented footguns in AGENTS.md: scrollMargin offset math,
  // measurementsCache being in absolute coords, estimate drift on sticky
  // headers — all of which were live bugs) for no measurable gain at this
  // row count. Plain flow layout below; DOM queries replace the two things
  // the virtualizer used to provide off its internal measurement cache.
  const rowsContainerRef = useRef<HTMLDivElement | null>(null);

  // Keep the focused row in view when keyboard nav moves outside the
  // viewport. Every row is a real DOM node now, so this is a direct
  // scrollIntoView instead of virtualizer.scrollToIndex.
  useEffect(() => {
    if (focusedRowIndex == null) return;
    const el = rowsContainerRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${focusedRowIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedRowIndex]);

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
      const container = rowsContainerRef.current;
      if (!container) return;
      // Every section header is a real, always-mounted DOM node now (no
      // virtualizer measurement cache to consult) — read its actual
      // viewport position directly. Cursor = viewport Y just below the
      // sticky strip; a header at/above that line means its rows are
      // currently under the strip.
      const stickyHeight = stickyRef.current?.offsetHeight ?? 200;
      const headers = container.querySelectorAll<HTMLElement>("[data-section-header]");
      // Find the section whose ROWS are currently under the sticky strip.
      // We track the most recent section-header at/above the cursor — so as
      // soon as a section's first row is in view (header may still be partly
      // visible), the indicator already announces the section. Headers are
      // in document order, so once one is below the line, all later ones
      // are too.
      let last: { sig: PortfolioSignalKey; count: number } | null = null;
      for (const el of headers) {
        if (el.getBoundingClientRect().top > stickyHeight) break;
        last = {
          sig: el.dataset.signal as PortfolioSignalKey,
          count: Number(el.dataset.count),
        };
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
  }, [selectedSignals.length, items]);

  // Range labels for the results bar: "Showing 1-50 of 774 accounts".
  // First and last 1-based row positions on the current page.
  const firstOnPage = props.totalRowCount === 0
    ? 0
    : (props.page - 1) * props.pageSize + 1;
  const lastOnPage = Math.min(props.page * props.pageSize, props.totalRowCount);

  return (
    <div style={{ background: "var(--page-bg)", minHeight: "calc(100vh - 120px)" }}>
      <Banner
        totalRows={props.totalRowCount}
        totalValueEur={props.portfolioValueEur}
        totalsBySignal={props.totalsBySignal}
        filterLabel={props.filterLabel ?? null}
        selectedSignals={props.selectedSignals}
        toggleSignal={props.toggleSignal}
      />

      <div className="page-gutter" style={{ paddingBottom: 60 }}>
        <div className="page-max">
          <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, marginBottom: -1 }} />
          {/* The ColumnHeaders/Row components already author role="columnheader"
              and role="row" on the header, but had no role="table"/"grid"
              ancestor — both roles are discarded by assistive tech without
              one. This wrapper makes them valid. Data rows stay real
              <button>s (not role="gridcell") rather than adopting the full
              ARIA grid pattern, which expects per-cell focus and would
              regress the Tab-per-row navigation this view already gets
              right; see each row's aria-label for the accessible-name fix. */}
          <div role="table" aria-label="Portfolio accounts">
          <div className={`pf-sticky${scrolled ? " scrolled" : ""}`} ref={stickyRef}>
            <Toolbar
              selectedSignals={props.selectedSignals}
              toggleSignal={props.toggleSignal}
              clearSignals={props.clearSignals}
              stackedSignals={props.stackedSignals}
              toggleStackedSignals={props.toggleStackedSignals}
              refine={props.refine}
              setRefine={props.setRefine}
              shownStatuses={props.shownStatuses}
              toggleStatus={props.toggleStatus}
              snoozedCount={props.snoozedCount}
              globalTotalsBySignal={props.globalTotalsBySignal}
              sortKey={props.sortKey}
              sortDirection={props.sortDirection}
              setSortKey={props.setSortKey}
              sortOptions={sortOptions}
              hasSavedDefault={props.hasSavedDefault}
              defaultsAreCurrent={props.defaultsAreCurrent}
              onResetDefaults={props.onResetDefaults}
              currentViewState={props.currentViewState}
              onApplyView={props.onApplyView}
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
            ref={rowsContainerRef}
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
              // Plain flow layout — a page tops out at 50 rows, cheap to
              // render in full. See the comment above rowsContainerRef.
              items.map((item) =>
                item.kind === "section-header" ? (
                  <div
                    key={item.key}
                    data-section-header=""
                    data-signal={item.signal}
                    data-count={item.count}
                  >
                    <SectionHeader signal={item.signal} count={item.count} />
                  </div>
                ) : (
                  <div key={item.key} data-row-index={item.index}>
                    <Row
                      row={item.row}
                      focused={focusedRowIndex === item.index}
                      onSelect={onSelect}
                      isLast={item.index === pageRowCount - 1}
                      showAvatar={showAvatar}
                      snoozedUntil={props.snoozeUntilById.get(item.row.id) ?? null}
                      onSnooze={props.onSnoozeCompany}
                      onUnsnooze={props.onUnsnoozeCompany}
                    />
                  </div>
                )
              )
            )}
          </div>
          </div>

          {/* Bottom page nav. Only shown when the result set spans multiple
              pages — single-page views skip the chrome entirely so the list
              ends cleanly at its last row. */}
          {props.totalPages > 1 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                paddingTop: 20,
              }}
            >
              <Pagination
                page={props.page}
                totalPages={props.totalPages}
                onPageChange={props.onPageChange}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--green-100)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                <strong style={{ color: "var(--moss)", fontWeight: 600 }}>
                  {firstOnPage}–{lastOnPage}
                </strong>
                <span>of</span>
                <strong style={{ color: "var(--moss)", fontWeight: 600 }}>
                  {props.totalRowCount}
                </strong>
                <span>{props.totalRowCount === 1 ? "account" : "accounts"}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Editorial banner ----------
