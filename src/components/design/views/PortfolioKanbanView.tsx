"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type PortfolioRefineState, type PortfolioRow, type PortfolioSignalKey, type PortfolioSortKey } from "@/lib/types";
import { getSortOptions } from "@/lib/portfolio";
import { type PortfolioShownStatuses, type PortfolioViewState } from "@/lib/portfolio-views";
import { groupByStage, flattenBoardOffsets, type KanbanColumnKey } from "@/lib/portfolio-kanban";
import { Banner } from "./portfolio/Banner";
import { KanbanBoard } from "./portfolio/KanbanBoard";
import { Toolbar } from "./portfolio/Toolbar";

interface Props {
  // Full filtered+sorted rows (NOT the page slice) - board mode bypasses
  // pagination entirely, so every matching row needs to land in a column.
  // Grouping happens here (groupByStage in a useMemo) rather than in the
  // container, so this view stays the single place that turns "rows" into
  // "board shape" - the container only ever needs the flat row list for
  // keyboard-nav bookkeeping.
  rows: PortfolioRow[];
  // Build time of the underlying payload (PortfolioResponse.generatedAt),
  // used as "now" for the relative date labels in buildKanbanCard (OB
  // meeting in N days, last touch N days ago). Falls back to the current
  // time if the container doesn't have a payload timestamp yet.
  nowIso: string;

  totalRowCount: number;
  totalsBySignal: Record<PortfolioSignalKey, number>;
  globalTotalsBySignal: Record<PortfolioSignalKey, number>;

  filterLabel?: string | null;
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

  snoozedCount: number;
  snoozeUntilById: Map<string, number>;
  onSnoozeCompany: (companyId: string, until: number) => void;
  onUnsnoozeCompany: (companyId: string) => void;

  currentViewState: PortfolioViewState;
  onApplyView: (state: PortfolioViewState) => void;

  portfolioValueEur: number;

  sortKey: PortfolioSortKey;
  sortDirection: "asc" | "desc";
  setSortKey: (k: PortfolioSortKey) => void;

  // Flat, column-major index (all rows of column 0, then column 1, ...).
  // Owned by PortfolioContainer - this view only reads it to render the
  // right card as focused and to scroll it into view.
  focusedRowIndex: number | null;
  onRowClick: (row: PortfolioRow) => void;

  // Kanban column keys collapsed by the user. Owned by PortfolioContainer
  // so it survives a table<->board flip and flows into saved views.
  collapsedStages: ReadonlySet<KanbanColumnKey>;
  toggleColumnCollapsed: (key: KanbanColumnKey) => void;

  hasSavedDefault: boolean;
  defaultsAreCurrent: boolean;
  onResetDefaults: () => void;
}

export function PortfolioKanbanView(props: Props) {
  const showAvatar = props.showAvatar ?? true;
  const sortOptions = getSortOptions(props.selectedSignals);

  const columns = useMemo(() => groupByStage(props.rows), [props.rows]);

  // Column-major flat index lookup. Shares flattenBoardOffsets with the
  // container's boardFlatRows (built via flattenBoard) so a collapsed
  // column is skipped identically on both sides - a focusedRowIndex from
  // the container always lands on the card it was computed for.
  const flatIndexOf = useMemo(() => {
    const offsets = flattenBoardOffsets(columns, props.collapsedStages);
    return (columnIdx: number, rowIdx: number) => offsets[columnIdx] + rowIdx;
  }, [columns, props.collapsedStages]);

  const boardRef = useRef<HTMLDivElement | null>(null);

  // Keep the focused card in view when keyboard nav moves it outside the
  // viewport. Same approach as PortfolioView.tsx's rowsContainerRef effect -
  // every card is a real DOM node, so a direct scrollIntoView replaces what
  // a virtualizer's scrollToIndex would otherwise provide.
  useEffect(() => {
    if (props.focusedRowIndex == null) return;
    const el = boardRef.current?.querySelector<HTMLElement>(
      `[data-row-index="${props.focusedRowIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [props.focusedRowIndex]);

  // Sticky toolbar shadow. Same 1px sentinel + IntersectionObserver pattern
  // as PortfolioView.tsx (see AGENTS.md "Sticky scroll-shadow pattern") -
  // fires the exact frame the strip pins, no scroll listener, no rAF.
  const [scrolled, setScrolled] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
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

      {/* 16px bottom (not the usual 60) because the board sizes itself to
          fill the viewport exactly (see KanbanBoard.tsx) - the page must not
          scroll; each column scrolls internally instead. */}
      <div className="page-gutter" style={{ paddingBottom: 16 }}>
        <div className="page-max">
          <div ref={sentinelRef} aria-hidden="true" style={{ height: 1, marginBottom: -1 }} />
          <div className={`pf-sticky${scrolled ? " scrolled" : ""}`}>
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
          </div>

          <div ref={boardRef} style={{ marginTop: 16 }}>
            {/* All 8 columns always render, even with zero rows total - each
                empty column shows its own "No accounts" placeholder (see
                KanbanBoard.tsx) rather than swapping the whole board for a
                single EditorialEmpty state. */}
            <KanbanBoard
              columns={columns}
              nowIso={props.nowIso}
              focusedFlatIndex={props.focusedRowIndex}
              flatIndexOf={flatIndexOf}
              onCardClick={props.onRowClick}
              showAvatar={showAvatar}
              collapsedStages={props.collapsedStages}
              onToggleCollapsed={props.toggleColumnCollapsed}
              snoozeUntilById={props.snoozeUntilById}
              onSnooze={props.onSnoozeCompany}
              onUnsnooze={props.onUnsnoozeCompany}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
