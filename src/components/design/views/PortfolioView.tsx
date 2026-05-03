"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { PortfolioRow, PortfolioSignalKey, PortfolioSortKey } from "@/lib/types";
import { PORTFOLIO_SIGNALS, PORTFOLIO_SIGNAL_MAP } from "@/lib/signals";
import { getSortOptions } from "@/lib/portfolio";
import { OWNER_MAP } from "@/lib/owners";
import { Avatar } from "../Avatar";
import { DashboardBanner } from "../DashboardBanner";
import { EditorialEmpty } from "../EditorialEmpty";

interface Props {
  rows: PortfolioRow[];
  totalsBySignal: Record<PortfolioSignalKey, number>;

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
}

// Stage chip palette. Reads tokens from globals.css so the lifecycle palette
// stays in one place and parallels the --pay-stage-* family.
const STAGE_BADGE: Record<PortfolioRow["stage"], { bg: string; fg: string }> = {
  Onboarding:   { bg: "var(--stage-onboarding-bg)",  fg: "var(--stage-onboarding-fg)" },
  Adopted:      { bg: "var(--stage-adopted-bg)",     fg: "var(--stage-adopted-fg)" },
  Started:      { bg: "var(--stage-started-bg)",     fg: "var(--stage-started-fg)" },
  "Ramp Up":    { bg: "var(--stage-rampup-bg)",      fg: "var(--stage-rampup-fg)" },
  Established: { bg: "var(--stage-established-bg)", fg: "var(--stage-established-fg)" },
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
//   STAGE 96 · ACCOUNT 1fr · SIGNALS 280 · HEALTH 60 · REVENUE 80 · LAST 50 · OWNER 44
//   STAGE 96 · ACCOUNT 1fr · SIGNALS 280 · HEALTH 60 · REVENUE 80 · LAST 50
//
// SIGNALS widened from 200 → 280 to fit the primary pill plus up to 2 inline
// labeled secondaries (dot + short label) plus an optional "+N" overflow.
// STAGE is 96 so "ESTABLISHED" (longest stage label) fits with breathing
// room. The chevron disclosure is absolute-positioned on the row so it
// doesn't need its own column.
const COLS_GRID_WITH_OWNER = "96px 1fr 280px 60px 80px 50px 44px";
const COLS_GRID_NO_OWNER   = "96px 1fr 280px 60px 80px 50px";

export function PortfolioView(props: Props) {
  const showAvatar = props.showAvatar ?? true;
  const sortOptions = getSortOptions(props.selectedSignals);

  // Aggregate metrics for the editorial banner.
  const totalRows = props.rows.length;
  const urgentCount = useMemo(
    () => props.rows.filter((r) => r.signals.some((s) => s.severity === "bad")).length,
    [props.rows]
  );

  return (
    <div style={{ background: "var(--page-bg)", minHeight: "calc(100vh - 120px)" }}>
      <Banner totalRows={totalRows} urgentCount={urgentCount} />

      <div style={{ padding: "0 28px 60px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div className="pf-sticky">
            <Toolbar
              selectedSignals={props.selectedSignals}
              toggleSignal={props.toggleSignal}
              clearSignals={props.clearSignals}
              totalsBySignal={props.totalsBySignal}
              sortKey={props.sortKey}
              sortDirection={props.sortDirection}
              setSortKey={props.setSortKey}
              sortOptions={sortOptions}
            />
            <ResultsBar
              rowCount={totalRows}
              isFiltered={props.selectedSignals.length > 0}
              clearSignals={props.clearSignals}
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
          </div>

          <div
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
            {props.rows.length === 0 ? (
              <EditorialEmpty
                headline="No accounts match."
                caption="Try removing a filter or clearing your search."
              />
            ) : (
              props.rows.map((row, i) => (
                <Row
                  key={row.id}
                  row={row}
                  focused={props.focusedRowIndex === i}
                  onClick={() => props.onRowClick(row)}
                  isLast={i === props.rows.length - 1}
                  showAvatar={showAvatar}
                />
              ))
            )}
          </div>

          <KeyboardHints />
        </div>
      </div>
    </div>
  );
}

// ---------- Editorial banner ----------

function Banner({ totalRows, urgentCount }: { totalRows: number; urgentCount: number }) {
  if (totalRows === 0) {
    return (
      <DashboardBanner
        eyebrow="Portfolio"
        maxWidth={1200}
        headline={<>No accounts in scope.</>}
        detail={<>Try a different filter to widen the search.</>}
      />
    );
  }

  return (
    <DashboardBanner
      eyebrow="Portfolio"
      maxWidth={1200}
      headline={
        <>
          {totalRows} {totalRows === 1 ? "customer" : "customers"} across your book.
        </>
      }
      detail={
        <>
          You have{" "}
          <span
            style={{
              color: "var(--citrus)",
              borderBottom: "1px dashed color-mix(in oklch, var(--citrus) 55%, transparent)",
              paddingBottom: 1,
            }}
          >
            {urgentCount} urgent
          </span>
          {urgentCount > 0 ? ": overdue invoices, churn intent, and volume drops." : "."}
        </>
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
}: ToolbarProps) {
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

  const sortLabel = sortOptions.find((o) => o.key === sortKey)?.label ?? "—";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        background: "var(--page-bg)",
        // Symmetric vertical padding: same breathing room above and below the
        // signal/sort selector row.
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

      <span style={{ flex: 1 }} />

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
    <div className="pf-pop" style={{ left: 0, minWidth: 280 }}>
      <div style={{ padding: "12px 20px 8px", borderBottom: "1px solid var(--hairline)" }}>
        <div style={eyebrowStyle}>Filter by signal</div>
        <div
          style={{
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
            fontSize: 12,
            color: "var(--green-100)",
            marginTop: 4,
          }}
        >
          Multi-select. Press <span className="pf-num-badge" style={{ fontSize: 11, height: 20, minWidth: 32 }}>1–8</span> to toggle.
        </div>
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
    </div>
  );
}

// ---------- Results bar ----------

function ResultsBar({
  rowCount,
  isFiltered,
  clearSignals,
  hasSavedDefault,
  defaultsAreCurrent,
  onSaveDefaults,
  onResetDefaults,
}: {
  rowCount: number;
  isFiltered: boolean;
  clearSignals: () => void;
  hasSavedDefault: boolean;
  defaultsAreCurrent: boolean;
  onSaveDefaults: () => void;
  onResetDefaults: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 18px",
        background: "var(--card-bg)",
        border: "1px solid var(--hairline)",
        borderBottom: "1px solid var(--hairline)",
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
      }}
    >
      <span
        style={{
          // DESIGN.md reserves --font-mono for kbd hints. Inter at 12px with
          // tabular-nums keeps the figure scannable and aligned with peers.
          fontSize: 12,
          color: "var(--green-100)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <strong style={{ color: "var(--moss)", fontWeight: 600 }}>
          {rowCount}
        </strong>
        <span>{rowCount === 1 ? "account" : "accounts"}</span>
        {isFiltered && <span style={{ opacity: 0.65 }}>· filtered</span>}
      </span>
      <span style={{ flex: 1 }} />
      {isFiltered && (
        <button
          onClick={clearSignals}
          style={{ ...ghostBtnStyle, marginRight: 8 }}
        >
          Clear filters
        </button>
      )}
      {hasSavedDefault && !defaultsAreCurrent && (
        <button onClick={onResetDefaults} style={{ ...ghostBtnStyle, marginRight: 8 }}>
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
      </button>
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
    if (!target) {
      return (
        <span style={{ ...eyebrowStyle, justifySelf: align === "end" ? "end" : "start" }}>
          {label}
        </span>
      );
    }
    // Direction-aware arrow on the active column; bidirectional ↕ on inactive
    // sortable columns to advertise that a click sorts.
    const arrow = sorted ? (sortDirection === "desc" ? "↓" : "↑") : "↕";
    return (
      <button
        onClick={() => setSortKey(target)}
        title={sorted ? "Click again to flip direction" : `Sort by ${label.toLowerCase()}`}
        className={`pf-col-head${sorted ? " sorted" : ""}`}
        style={{ justifySelf: align === "end" ? "end" : "start" }}
      >
        <span>{label}</span>
        <span className="arrow">{arrow}</span>
      </button>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: showAvatar ? COLS_GRID_WITH_OWNER : COLS_GRID_NO_OWNER,
        gap: 12,
        padding: "10px 18px 8px",
        background: "var(--card-bg)",
        borderLeft: "1px solid var(--hairline)",
        borderRight: "1px solid var(--hairline)",
        borderBottom: "1px solid var(--hairline-strong)",
      }}
    >
      {header("Stage", "stage")}
      {header("Account", "name")}
      <span style={eyebrowStyle}>Signals</span>
      {header("Health", "health", "end")}
      {header("Revenue", "revenue", "end")}
      {header("Last", "last_contact", "end")}
      {showAvatar && (
        <span style={{ ...eyebrowStyle, justifySelf: "end" }}>Owner</span>
      )}
    </div>
  );
}

// ---------- Row ----------

function Row({
  row,
  focused,
  onClick,
  isLast,
  showAvatar,
}: {
  row: PortfolioRow;
  focused: boolean;
  onClick: () => void;
  isLast: boolean;
  showAvatar: boolean;
}) {
  const stage = STAGE_BADGE[row.stage];
  const primary = row.signals[0];
  const extras = row.signals.slice(1);
  const healthColor =
    row.healthScore == null
      ? "var(--green-100)"
      : row.healthScore >= 80
        ? "var(--moss)"
        : row.healthScore >= 65
          ? "var(--green-100)"
          : row.healthScore >= 50
            ? "var(--rust)"
            : "var(--red)";

  // Resolve to an OwnerLike for the shared Avatar. Falls back to a synthetic
  // { name } if the row carries an ownerName but no canonical map entry, so
  // the initial still renders.
  const owner = row.ownerId ? OWNER_MAP[row.ownerId] : null;
  const ownerForAvatar = owner ?? (row.ownerName ? { name: row.ownerName } : null);

  return (
    <button
      type="button"
      onClick={onClick}
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
        {(primary?.detail || row.domain) && (
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
            {primary?.detail ?? row.domain}
          </div>
        )}
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
          justifySelf: "start",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        {primary ? (
          <SignalPill
            kind={primary.kind}
            title={primary.title}
            severity={primary.severity}
          />
        ) : (
          <span style={{ fontSize: 11, color: "var(--green-100)", fontStyle: "italic", fontFamily: "var(--font-editorial)" }}>
            calm
          </span>
        )}
        {extras.length > 0 && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: "var(--green-100)",
              minWidth: 0,
            }}
          >
            {extras.slice(0, 2).map((s, i) => {
              const meta = signalMetaFor(s.kind, s.title);
              return (
                <span
                  key={i}
                  title={s.title}
                  aria-label={s.title}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, flex: "0 0 auto" }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: meta.color,
                      flex: "0 0 auto",
                    }}
                  />
                  {meta.short}
                </span>
              );
            })}
            {extras.length > 2 && (
              <span
                title={extras.slice(2).map((s) => s.title).join(" · ")}
                style={{ fontSize: 10, color: "var(--green-100)", fontWeight: 500 }}
              >
                +{extras.length - 2}
              </span>
            )}
          </span>
        )}
      </div>

      <span
        style={{
          color: healthColor,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 600,
          textAlign: "right",
          justifySelf: "end",
        }}
      >
        {row.healthScore == null ? "—" : Math.round(row.healthScore)}
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
        {row.revenue ? `€${formatNum(row.revenue)}` : "—"}
      </span>

      <span
        style={{
          color: "var(--green-100)",
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
          justifySelf: "end",
        }}
      >
        {row.daysSinceContact == null ? "—" : `${row.daysSinceContact}d`}
      </span>

      {showAvatar && (
        <span style={{ justifySelf: "end" }}>
          <Avatar owner={ownerForAvatar} size={22} />
        </span>
      )}

      {/* Chevron sits outside the grid so its hover-only opacity doesn't
          push the avatar around. Absolute-positioned to the row's right
          gutter (the 18px row padding leaves room). */}
      <span
        className="row-chevron"
        aria-hidden="true"
        style={{
          position: "absolute",
          right: 4,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 14,
          pointerEvents: "none",
        }}
      >
        ›
      </span>
    </button>
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
  const meta = signalMetaFor(kind, title);
  const isOpenInvoice = title === "Open invoice";
  const tone = isOpenInvoice ? "warn" : meta.severity;
  const palette = TONE_PALETTE[tone];

  return (
    <span
      title={title}
      aria-label={title}
      style={{
        background: palette.bg,
        color: palette.fg,
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        padding: "2px 7px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 200,
        display: "inline-block",
      }}
    >
      {pillText(kind, title, severity)}
    </span>
  );
}

const TONE_PALETTE: Record<"bad" | "warn", { bg: string; fg: string }> = {
  bad:  { bg: "color-mix(in oklch, var(--rust) 12%, transparent)", fg: "var(--rust)" },
  warn: { bg: "var(--status-warn-bg)", fg: "var(--status-warn-fg)" },
};

// Compress signal title to fit the pill when possible. Falls back to title.
function pillText(kind: string, title: string, _severity: "bad" | "warn"): string {
  if (title === "Open invoice") return "Open invoice";
  if (kind === "overdue_invoice") return title.replace("Invoice overdue ", "").replace(" days", "d") || title;
  if (kind === "wish_to_churn") return "Wish to churn";
  if (kind === "volume_declining") return "Volume declining";
  if (kind === "no_future_events") return "No future events";
  if (kind === "stuck_in_step") return title;
  if (kind === "health_dropped") return title.replace("Health score ", "Health ");
  if (kind === "gone_quiet") return title.replace("Last contact ", "Quiet ");
  return title;
}

// Empty state now uses the shared <EditorialEmpty /> primitive so wording
// and rhythm stay consistent with Briefing, Onboarding, and the detail pane.

// ---------- Keyboard hints footer ----------

function KeyboardHints() {
  return (
    <div
      style={{
        marginTop: 14,
        fontSize: 11,
        color: "var(--green-100)",
        display: "flex",
        gap: 16,
        justifyContent: "center",
        flexWrap: "wrap",
      }}
    >
      <span><span className="kbd">↑↓</span> navigate</span>
      <span><span className="kbd">↵</span> open</span>
      <span><span className="kbd">1-8</span> filter</span>
      <span><span className="kbd">0</span> clear</span>
      <span><span className="kbd">S</span> sort</span>
      <span><span className="kbd">⌘S</span> save</span>
    </div>
  );
}

// ---------- helpers ----------

function signalMetaFor(kind: string, title: string) {
  if (title === "Open invoice") return PORTFOLIO_SIGNAL_MAP.open_invoices;
  switch (kind) {
    case "overdue_invoice":   return PORTFOLIO_SIGNAL_MAP.overdue_invoices;
    case "wish_to_churn":     return PORTFOLIO_SIGNAL_MAP.wish_to_churn;
    case "volume_declining":  return PORTFOLIO_SIGNAL_MAP.volume_declining;
    case "no_future_events":  return PORTFOLIO_SIGNAL_MAP.no_future_events;
    case "stuck_in_step":     return PORTFOLIO_SIGNAL_MAP.stuck_in_step;
    case "health_dropped":    return PORTFOLIO_SIGNAL_MAP.health_dropped;
    case "gone_quiet":        return PORTFOLIO_SIGNAL_MAP.gone_quiet;
    default:                  return PORTFOLIO_SIGNAL_MAP.gone_quiet;
  }
}

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
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, close, ref]);
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 10 10"
      fill="none"
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

const eyebrowStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  textTransform: "uppercase",
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
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
