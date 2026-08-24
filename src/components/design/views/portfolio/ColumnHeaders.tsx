"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { type PortfolioSignalKey, type PortfolioSortKey } from "@/lib/types";
import { PORTFOLIO_SIGNAL_MAP } from "@/lib/signals";
import { COLS_GRID_NO_OWNER, COLS_GRID_WITH_OWNER, COL_SORT_MAP, eyebrowStyle } from "./chrome";

export function ColumnHeaders({
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
      {header("ACV", "revenue", "end")}
      {header("Last", "last_contact", "end")}
      {showAvatar && (
        <span role="columnheader" style={{ ...eyebrowStyle, justifySelf: "end" }}>Owner</span>
      )}
      {/* Quick-actions column: no visible label (the glyph cluster is
          self-explanatory), but the columnheader still needs an accessible
          name for AT users navigating by column. */}
      <span role="columnheader" aria-label="Quick actions" />
    </div>
  );
}

// ---------- Row ----------

// Rendered between row groups when 2+ signals are selected. Echoes the
// signal's brand color via a 6px leading dot, the signal's full label,
// and the count in this section. Keeps the column-grid alignment by
// occupying its own pseudo-row above the rows it groups.
export function SectionHeader({
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
