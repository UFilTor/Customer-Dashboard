"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { useEffect, useRef, useState } from "react";
import { type PortfolioRefineState, type PortfolioSignalKey, type PortfolioSortKey } from "@/lib/types";
import { PORTFOLIO_SIGNALS, PORTFOLIO_SIGNAL_MAP } from "@/lib/signals";
import { getSortOptions } from "@/lib/portfolio";
import { type PortfolioShownStatuses, type PortfolioViewState, type SavedPortfolioView } from "@/lib/portfolio-views";
import { RefinePill, refineActiveCount } from "./RefinePill";
import { SearchPill } from "./SearchPill";
import { StatusFilterPill } from "./StatusFilterPill";
import { ViewsPill } from "./ViewsPill";
import { useDashboardSlot } from "@/components/design/dashboard-slot";
import { Caret, eyebrowStyle, formatNum, ghostBtnStyle, pillTriggerStyle, useOutsideClose } from "./chrome";

export interface ToolbarProps {
  // Free-text account filter. Owned by page-client (URL param `q`) so it
  // survives a table/board flip and a company-detail round-trip.
  search: string;
  onSearchChange: (q: string) => void;
  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (k: PortfolioSignalKey) => void;
  clearSignals: () => void;
  stackedSignals: boolean;
  toggleStackedSignals: () => void;
  refine: PortfolioRefineState;
  setRefine: (next: PortfolioRefineState | ((prev: PortfolioRefineState) => PortfolioRefineState)) => void;
  shownStatuses: PortfolioShownStatuses;
  toggleStatus: (s: keyof PortfolioShownStatuses) => void;
  // Toolbar feeds the FilterDropdown with the totals of the rows the
  // Person/Region filter and Status setting show (before Search, Refine and
  // the signal selection) so signal counts stay
  // stable as the user toggles signals. The visible-list totals (used by the
  // banner) live one level up in PortfolioView.
  globalTotalsBySignal: Record<PortfolioSignalKey, number>;
  sortKey: PortfolioSortKey;
  sortDirection: "asc" | "desc";
  setSortKey: (k: PortfolioSortKey) => void;
  sortOptions: ReturnType<typeof getSortOptions>;
  hasSavedDefault: boolean;
  defaultsAreCurrent: boolean;
  onResetDefaults: () => void;
  snoozedCount: number;
  currentViewState: PortfolioViewState;
  onApplyView: (view: SavedPortfolioView) => void;
  activeViewId: string | null;
  onDetachView: () => void;
  // "Showing X of Y": X is the filtered row count, Y the rows before
  // Signals, Refine and Search (Status + territory scope only).
  totalRowCount: number;
  scopeRowCount: number;
}

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
      {/* Header carries the Clear-all action on the right so the popover
          ends cleanly at the last signal row (no bottom-strip chrome). */}
      <div
        style={{
          padding: "10px 14px 8px 20px",
          borderBottom: "1px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={eyebrowStyle}>Filter by signal</div>
        <span style={{ flex: 1 }} />
        <button
          onClick={clearSignals}
          style={{
            background: "transparent",
            color: "var(--moss)",
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 6px",
            borderRadius: 6,
            cursor: "pointer",
            border: 0,
          }}
        >
          Clear all
        </button>
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
}: {
  sortKey: PortfolioSortKey;
  sortDirection: "asc" | "desc";
  sortOptions: ReturnType<typeof getSortOptions>;
  setSortKey: (k: PortfolioSortKey) => void;
  onClose: () => void;
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
      // Sort lives at the right edge of the toolbar, so anchor the popover's
      // right edge to the trigger and grow leftward. Otherwise it overflows
      // the table on standard viewports. minWidth ensures longer labels
      // (e.g. "Days in stage") don't wrap onto a second line.
      style={{ right: 0, minWidth: 200, whiteSpace: "nowrap" }}
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
      {/* No footer — keyboard hints moved into the global shortcut cheatsheet
          (open with `?`). Keeps the Sort popover compact. */}
    </div>
  );
}

// ---------- Column headers ----------

export function Toolbar({
  search,
  onSearchChange,
  selectedSignals,
  toggleSignal,
  clearSignals,
  stackedSignals,
  toggleStackedSignals,
  refine,
  setRefine,
  shownStatuses,
  toggleStatus,
  globalTotalsBySignal,
  sortKey,
  sortDirection,
  setSortKey,
  sortOptions,
  hasSavedDefault,
  defaultsAreCurrent,
  onResetDefaults,
  snoozedCount,
  currentViewState,
  onApplyView,
  activeViewId,
  onDetachView,
  totalRowCount,
  scopeRowCount,
}: ToolbarProps) {
  // "Clear all" covers the filters this toolbar owns: Signals, Refine, Status
  // and Search. Sort, the table/board toggle, saved views and the global
  // Person/Region filter stay as they are. The Any/All match mode doesn't
  // count as a filter on its own (it's a no-op below two signals), but it is
  // reset alongside the signals.
  const isFiltered =
    selectedSignals.length > 0 ||
    refineActiveCount(refine) > 0 ||
    Object.values(shownStatuses).some(Boolean) ||
    search !== "";

  function clearAll() {
    clearSignals();
    if (stackedSignals) toggleStackedSignals();
    setRefine({});
    // Back to the default "Active only": switch off every status that's on.
    // SAFETY: shownStatuses is a PortfolioShownStatuses literal built by the
    // container, so its keys are exactly that interface's keys.
    for (const s of Object.keys(shownStatuses) as Array<keyof PortfolioShownStatuses>) {
      if (shownStatuses[s]) toggleStatus(s);
    }
    if (search !== "") onSearchChange("");
    // Cleared filters no longer describe any saved view, so the Views pill
    // goes back to "N saved" instead of showing "<name> · edited".
    onDetachView();
  }

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
  // A hidden Portfolio stays mounted behind other dashboards; ignore keys
  // unless it is the one on screen.
  const { active: slotActive } = useDashboardSlot();
  // Close the popup when Portfolio leaves the screen (a `g m` chord or a
  // company detail). The slot stays mounted, so an open popup would keep
  // listening for arrows/Enter meant for the dashboard in front.
  if (!slotActive && (filterOpen || sortOpen)) {
    setFilterOpen(false);
    setSortOpen(false);
  }
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!slotActive) return;
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
  }, [filterOpen, sortOpen, slotActive]);

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
        // Relative so the absolutely-positioned Pagination can pin itself
        // to the toolbar's true horizontal center, independent of the count
        // text's width on the left or the action cluster's width on the right.
        position: "relative",
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
            totalsBySignal={globalTotalsBySignal}
            onClose={() => setFilterOpen(false)}
          />
        )}
      </div>

      <RefinePill
        refine={refine}
        setRefine={setRefine}
        selectedSignals={selectedSignals}
        stackedSignals={stackedSignals}
        toggleStackedSignals={toggleStackedSignals}
      />

      <StatusFilterPill
        shownStatuses={shownStatuses}
        toggleStatus={toggleStatus}
        snoozedCount={snoozedCount}
      />

      {/* Sits immediately before the flex spacer so expanding eats the row's
          empty middle instead of shoving the filter pills left of it. */}
      <SearchPill search={search} onSearchChange={onSearchChange} />

      <span style={{ flex: 1 }} />

      {hasSavedDefault && !defaultsAreCurrent && (
        <button onClick={onResetDefaults} style={ghostBtnStyle}>
          Reset to default
        </button>
      )}

      <ViewsPill
        currentViewState={currentViewState}
        onApplyView={onApplyView}
        activeViewId={activeViewId}
      />

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
          />
        )}
      </div>

      {/* Filter summary line. A full-width flex item, so it wraps onto its
          own row inside the sticky strip, and only while something is
          filtered. Clear all lives here, next to what it clears. */}
      {isFiltered && (
        <div
          style={{
            flexBasis: "100%",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--green-100)",
          }}
        >
          <span role="status">
            Showing{" "}
            <strong style={{ color: "var(--moss)", fontWeight: 600 }}>{formatNum(totalRowCount)}</strong>
            {" "}of{" "}
            <strong style={{ color: "var(--moss)", fontWeight: 600 }}>{formatNum(scopeRowCount)}</strong>
            {scopeRowCount === 1 ? " account" : " accounts"}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={clearAll} style={ghostBtnStyle}>
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Filter dropdown ----------
