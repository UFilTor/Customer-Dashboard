"use client";

// Kanban column shell + grid. Presentation only, no data fetching. The
// container (PortfolioContainer.tsx) owns focus state and row grouping;
// this component just renders KANBAN_COLUMNS.length columns of cards.

import { useCallback, useEffect, useRef, useState } from "react";
import { type PortfolioRow } from "@/lib/types";
import { type KanbanColumn, type KanbanColumnKey } from "@/lib/portfolio-kanban";
import { fmtEur } from "@/lib/format-design";
import { KanbanCard } from "./KanbanCard";

interface KanbanBoardProps {
  columns: KanbanColumn[];
  nowIso: string;
  focusedFlatIndex: number | null;
  flatIndexOf: (columnIdx: number, rowIdx: number) => number;
  onCardClick: (row: PortfolioRow) => void;
  showAvatar?: boolean;
  collapsedStages: ReadonlySet<KanbanColumnKey>;
  onToggleCollapsed: (key: KanbanColumnKey) => void;
  snoozeUntilById: Map<string, number>;
  onSnooze: (companyId: string, until: number) => void;
  onUnsnooze: (companyId: string) => void;
}

// Columns never crush narrower than this: below it a card's ACV/signal
// line wraps awkwardly. The outer wrapper scrolls horizontally instead.
const MIN_COLUMN_WIDTH = 240;
// Collapsed column rail width - just enough for the vertical label,
// count badge, and toggle chevron.
const COLLAPSED_COLUMN_WIDTH = 40;
const COLUMN_GAP = 16;

// HubSpot-style double chevron: rotates 180deg to flip direction, same
// transition convention as Caret in chrome.tsx.
function CollapseToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.2s", opacity: 0.7 }}
    >
      <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 2L5.5 5L8.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function KanbanBoard({
  columns,
  nowIso,
  focusedFlatIndex,
  flatIndexOf,
  onCardClick,
  showAvatar = true,
  collapsedStages,
  onToggleCollapsed,
  snoozeUntilById,
  onSnooze,
  onUnsnooze,
}: KanbanBoardProps) {
  const minWidth =
    columns.reduce(
      (sum, col) => sum + (collapsedStages.has(col.def.key) ? COLLAPSED_COLUMN_WIDTH : MIN_COLUMN_WIDTH),
      0
    ) + Math.max(columns.length - 1, 0) * COLUMN_GAP;
  const gridTemplateColumns = columns
    .map((col) =>
      collapsedStages.has(col.def.key) ? `${COLLAPSED_COLUMN_WIDTH}px` : `minmax(${MIN_COLUMN_WIDTH}px, 1fr)`
    )
    .join(" ");

  // The board is the page's only vertical scroll surface: it fills the
  // viewport from its own top edge down (minus the 16px bottom gutter its
  // view wrapper keeps), so the page itself never scrolls and each column
  // body scrolls internally instead. The top offset is measured from the
  // real DOM (callback-ref pattern, see AGENTS.md) because banner/toolbar
  // heights vary; document-relative via scrollY so a pre-scrolled page
  // measures correctly. Re-measured on window resize.
  const [boardTop, setBoardTop] = useState(320);
  const wrapElRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useCallback((el: HTMLDivElement | null) => {
    wrapElRef.current = el;
    if (el) setBoardTop(Math.round(el.getBoundingClientRect().top + window.scrollY));
  }, []);
  useEffect(() => {
    // rAF-coalesced: resize fires ~60/s while dragging a window edge and
    // each measure is a forced layout read.
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = wrapElRef.current;
      if (el) setBoardTop(Math.round(el.getBoundingClientRect().top + window.scrollY));
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", schedule);
    // Content above the board changes height without a window resize: the
    // banner rewrapping on filter change, the refresh-failed notice
    // appearing, toolbar pills wrapping after a snooze, display fonts
    // swapping in. Any of those changes the body's content height, so a
    // body ResizeObserver catches them all and keeps boardTop fresh.
    const ro = new ResizeObserver(schedule);
    ro.observe(document.body);
    return () => {
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={measureRef}
      style={{
        overflowX: "auto",
        // max() keeps the board usable on very short windows.
        height: `max(320px, calc(100vh - ${boardTop}px - 16px))`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns,
          gap: COLUMN_GAP,
          alignItems: "stretch",
          minWidth,
          height: "100%",
        }}
      >
        {columns.map((col, columnIdx) => {
          const isCollapsed = collapsedStages.has(col.def.key);

          if (isCollapsed) {
            return (
              <button
                key={col.def.key}
                type="button"
                onClick={() => onToggleCollapsed(col.def.key)}
                aria-expanded={false}
                aria-label={`Expand ${col.def.label} column`}
                style={{
                  width: COLLAPSED_COLUMN_WIDTH,
                  minWidth: COLLAPSED_COLUMN_WIDTH,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 0",
                  background: "var(--card-bg)",
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "var(--hairline)",
                  borderRadius: 16,
                  cursor: "pointer",
                  font: "inherit",
                  color: "inherit",
                }}
              >
                <CollapseToggleIcon collapsed />
                <span
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    color: "var(--moss)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.def.label}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: "var(--lichen)",
                    color: "var(--moss)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {col.count}
                </span>
              </button>
            );
          }

          return (
            <div
              key={col.def.key}
              style={{
                background: "var(--card-bg)",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--hairline)",
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "relative",
                  padding: "14px 14px 12px",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                {/* Single muted accent per AGENTS.md guidance: one token for
                    every column rather than a per-column color wheel. */}
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 14,
                    right: 14,
                    height: 3,
                    background: "var(--moss)",
                    borderRadius: "0 0 2px 2px",
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => onToggleCollapsed(col.def.key)}
                    aria-expanded={true}
                    aria-label={`Collapse ${col.def.label} column`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 20,
                      height: 20,
                      flexShrink: 0,
                      borderRadius: 6,
                      background: "transparent",
                      color: "var(--moss)",
                      cursor: "pointer",
                      font: "inherit",
                    }}
                  >
                    <CollapseToggleIcon collapsed={false} />
                  </button>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      color: "var(--moss)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.def.label}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 999,
                      background: "var(--lichen)",
                      color: "var(--moss)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {col.count}
                  </span>
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: "var(--green-100)" }}>
                  <span style={{ fontWeight: 600, color: "var(--moss)" }}>{fmtEur(col.acvEur)}</span> ACV
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 10,
                  overflowY: "auto",
                  // Fill the stretched column and scroll internally; minHeight 0
                  // lets the flex child actually shrink below its content size.
                  flex: 1,
                  minHeight: 0,
                }}
              >
                {col.rows.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--green-100)", padding: "8px 4px", fontStyle: "italic" }}>
                    No accounts
                  </div>
                ) : (
                  col.rows.map((row, rowIdx) => {
                    const flatIndex = flatIndexOf(columnIdx, rowIdx);
                    return (
                      <KanbanCard
                        key={row.id}
                        row={row}
                        columnKey={col.def.key}
                        nowIso={nowIso}
                        focused={focusedFlatIndex === flatIndex}
                        showAvatar={showAvatar}
                        flatIndex={flatIndex}
                        onClick={onCardClick}
                        snoozedUntil={snoozeUntilById.get(row.id) ?? null}
                        onSnooze={onSnooze}
                        onUnsnooze={onUnsnooze}
                      />
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
