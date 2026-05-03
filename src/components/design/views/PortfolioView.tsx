"use client";

import type { CSSProperties } from "react";
import type { PortfolioRow, PortfolioSignalKey, PortfolioSortKey } from "@/lib/types";
import { PORTFOLIO_SIGNALS, PORTFOLIO_SIGNAL_MAP } from "@/lib/signals";
import { getSortOptions } from "@/lib/portfolio";

interface Props {
  rows: PortfolioRow[];
  totalsBySignal: Record<PortfolioSignalKey, number>;

  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (key: PortfolioSignalKey) => void;
  clearSignals: () => void;

  sortKey: PortfolioSortKey;
  setSortKey: (k: PortfolioSortKey) => void;

  focusedRowIndex: number | null;
  onRowClick: (row: PortfolioRow) => void;

  hasSavedDefault: boolean;
  defaultsAreCurrent: boolean;
  onSaveDefaults: () => void;
  onResetDefaults: () => void;
}

const STAGE_BADGE: Record<PortfolioRow["stage"], { bg: string; fg: string }> = {
  Onboarding:   { bg: "#FCE9C2", fg: "#7A4A00" },
  Adopted:      { bg: "#FFE2C2", fg: "#7A3F00" },
  Started:      { bg: "#FFE6E0", fg: "#8B2A14" },
  "Ramp Up":    { bg: "#D7E9D2", fg: "#1F4A22" },
  Established:  { bg: "#D5DFCA", fg: "#022C12" },
};

export function PortfolioView(props: Props) {
  const sortOptions = getSortOptions(props.selectedSignals);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {PORTFOLIO_SIGNALS.map((meta) => {
          const active = props.selectedSignals.includes(meta.key);
          const count = props.totalsBySignal[meta.key] ?? 0;
          return (
            <button
              key={meta.key}
              onClick={() => props.toggleSignal(meta.key)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: `1px solid ${meta.color}`,
                background: active ? meta.color : "transparent",
                color: active ? "#fff" : meta.color,
                font: "inherit",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {meta.label} · {count}
            </button>
          );
        })}
        {props.selectedSignals.length > 0 && (
          <button
            onClick={props.clearSignals}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--text-muted, #6e6e6e)",
              background: "transparent",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          Sort
          <select
            value={props.sortKey}
            onChange={(e) => props.setSortKey(e.target.value as PortfolioSortKey)}
            style={{ padding: "4px 8px", border: "1px solid var(--moss, #022C12)", borderRadius: 8 }}
          >
            {sortOptions.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
          <button onClick={props.onSaveDefaults} style={linkButtonStyle}>
            Save as default
          </button>
          {props.hasSavedDefault && !props.defaultsAreCurrent && (
            <button onClick={props.onResetDefaults} style={linkButtonStyle}>
              Reset to defaults
            </button>
          )}
        </div>
      </div>

      <div role="list" style={{ borderTop: "1px solid var(--separator, #e5e5e5)" }}>
        {props.rows.map((row, i) => {
          const focused = props.focusedRowIndex === i;
          return (
            <PortfolioRowItem
              key={row.id}
              row={row}
              focused={focused}
              onClick={() => props.onRowClick(row)}
            />
          );
        })}
        {props.rows.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted, #6e6e6e)" }}>
            No accounts match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}

function PortfolioRowItem({
  row,
  focused,
  onClick,
}: {
  row: PortfolioRow;
  focused: boolean;
  onClick: () => void;
}) {
  const visiblePills = row.signals.slice(0, 3);
  const overflowCount = Math.max(0, row.signals.length - 3);
  const stage = STAGE_BADGE[row.stage];
  const healthColor =
    row.healthScore == null ? "#6e6e6e"
    : row.healthScore >= 80 ? "#1F4A22"
    : row.healthScore >= 60 ? "#7A4A00"
    : row.healthScore >= 40 ? "#8B5A14"
    : "#8B2A14";

  return (
    <div
      role="listitem"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto auto auto auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 12px",
        borderBottom: "1px solid var(--separator, #e5e5e5)",
        background: focused ? "rgba(241, 249, 126, 0.25)" : "transparent",
        cursor: "pointer",
        font: "inherit",
        fontSize: 14,
      }}
    >
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 6,
          background: stage.bg,
          color: stage.fg,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.2,
        }}
      >
        {row.stage}
      </span>
      <span style={{ fontWeight: 600 }}>{row.name}</span>
      <span style={{ display: "flex", gap: 4 }}>
        {visiblePills.map((s, i) => {
          const meta = mapKindToMeta(s.kind, s.title);
          return (
            <span
              key={i}
              title={s.detail}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                background: `${meta.color}1a`,
                color: meta.color,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {meta.short}
            </span>
          );
        })}
        {overflowCount > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-muted, #6e6e6e)" }}>
            +{overflowCount}
          </span>
        )}
      </span>
      <span style={{ color: healthColor, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>
        {row.healthScore ?? "-"}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 80, textAlign: "right" }}>
        {row.revenue ? `€${formatNum(row.revenue)}` : "-"}
      </span>
      <span style={{ color: "var(--text-muted, #6e6e6e)", minWidth: 36, textAlign: "right" }}>
        {row.daysSinceContact == null ? "-" : `${row.daysSinceContact}d`}
      </span>
      <span style={{ color: "var(--text-muted, #6e6e6e)" }}>
        {row.ownerName ?? "-"}
      </span>
    </div>
  );
}

function mapKindToMeta(kind: string, title: string) {
  // The synthesized open-invoice entry uses kind="overdue_invoice" but
  // title "Open invoice". Distinguish by title so users see the warn color.
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

const linkButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--moss, #022C12)",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
  padding: 0,
};
