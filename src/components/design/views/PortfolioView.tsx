"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { PortfolioRow, PortfolioSignalKey, PortfolioSortKey } from "@/lib/types";
import { PORTFOLIO_SIGNALS, PORTFOLIO_SIGNAL_MAP } from "@/lib/signals";
import { getSortOptions } from "@/lib/portfolio";
import { OWNER_MAP } from "@/lib/owners";

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

// Stage chip palette. Calm cream-toned swatches; meaning carries through label.
const STAGE_BADGE: Record<PortfolioRow["stage"], { bg: string; fg: string }> = {
  Onboarding:   { bg: "#FCE9C2", fg: "#7A4A00" },
  Adopted:      { bg: "#FFE2C2", fg: "#7A3F00" },
  Started:      { bg: "#FFE6E0", fg: "#8B2A14" },
  "Ramp Up":    { bg: "#D7E9D2", fg: "#1F4A22" },
  Established:  { bg: "#D5DFCA", fg: "#022C12" },
};

// Universal sort keys that map to clickable column headers.
const COL_SORT_MAP: Partial<Record<string, PortfolioSortKey>> = {
  name: "name",
  health: "health",
  revenue: "revenue",
  last_contact: "last_contact",
};

const COLS_GRID = "76px 1fr 220px 90px 110px 60px 28px 16px";

export function PortfolioView(props: Props) {
  const sortOptions = getSortOptions(props.selectedSignals);

  // Aggregate metrics for the editorial banner.
  const totalRows = props.rows.length;
  const urgentCount = useMemo(
    () => props.rows.filter((r) => r.signals.some((s) => s.severity === "bad")).length,
    [props.rows]
  );
  const totalRevenue = useMemo(
    () => props.rows.reduce((sum, r) => sum + (r.revenue || 0), 0),
    [props.rows]
  );

  return (
    <div style={{ background: "var(--page-bg)", minHeight: "calc(100vh - 120px)" }}>
      <Banner totalRows={totalRows} urgentCount={urgentCount} totalRevenue={totalRevenue} />

      <div style={{ padding: "0 28px 60px" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto" }}>
          <div className="pf-sticky">
            <Toolbar
              selectedSignals={props.selectedSignals}
              toggleSignal={props.toggleSignal}
              clearSignals={props.clearSignals}
              totalsBySignal={props.totalsBySignal}
              sortKey={props.sortKey}
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
            <ColumnHeaders sortKey={props.sortKey} setSortKey={props.setSortKey} />
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
              <EmptyState />
            ) : (
              props.rows.map((row, i) => (
                <Row
                  key={row.id}
                  row={row}
                  focused={props.focusedRowIndex === i}
                  onClick={() => props.onRowClick(row)}
                  isLast={i === props.rows.length - 1}
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

function Banner({ totalRows, urgentCount, totalRevenue }: { totalRows: number; urgentCount: number; totalRevenue: number }) {
  const dateStr = useDateLabel();
  const greeting = useGreeting();
  const calmCount = Math.max(0, totalRows - urgentCount);

  return (
    <div style={{ padding: "20px 28px 24px" }}>
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          background: "linear-gradient(135deg, #022C12 0%, #1D261F 100%)",
          color: "var(--page-bg)",
          borderRadius: 18,
          padding: "26px 36px 28px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 220,
            height: 220,
            borderRadius: "50%",
            background:
              "radial-gradient(circle at 30% 30%, rgba(241,249,126,0.06), rgba(241,249,126,0) 60%), #1D261F",
            border: "1px solid rgba(241,249,126,0.12)",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            width: 96,
            height: 96,
            borderRadius: "50%",
            background: "#0A3A1B",
            border: "1px solid rgba(241,249,126,0.2)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 9.5,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--citrus)",
            }}
          >
            Portfolio
          </span>
          <span style={{ width: 28, height: 1, background: "rgba(241,249,126,0.5)" }} />
          <span
            style={{
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {dateStr}
          </span>
        </div>

        <div style={{ marginTop: 14, position: "relative", zIndex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
              fontSize: 30,
              fontWeight: 400,
              color: "var(--page-bg)",
              lineHeight: 1.1,
              letterSpacing: "-0.005em",
            }}
          >
            {greeting}.
          </div>
        </div>

        <h1
          style={{
            margin: "8px 0 0",
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: "-0.005em",
            lineHeight: 1.05,
            color: "var(--page-bg)",
            position: "relative",
            zIndex: 1,
            maxWidth: 720,
          }}
        >
          <span style={{ color: "var(--citrus)" }}>{totalRows} {totalRows === 1 ? "customer" : "customers"}</span> across your book.
        </h1>

        <div
          style={{
            marginTop: 14,
            fontSize: 13.5,
            color: "rgba(255,255,255,0.78)",
            lineHeight: 1.65,
            maxWidth: 720,
            position: "relative",
            zIndex: 1,
          }}
        >
          You have{" "}
          <span
            style={{
              color: "var(--citrus)",
              borderBottom: "1px dashed rgba(241,249,126,0.55)",
              paddingBottom: 1,
            }}
          >
            {urgentCount} urgent
          </span>
          {urgentCount > 0 ? " — overdue invoices, churn intent, and volume drops." : "."}{" "}
          {calmCount > 0 ? `${calmCount} ${calmCount === 1 ? "is" : "are"} tracking calm.` : ""}
          {totalRevenue > 0 && (
            <>
              <br />
              Combined trailing revenue:{" "}
              <span style={{ color: "var(--citrus)" }}>€{formatNum(totalRevenue)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Toolbar (filter + sort triggers) ----------

interface ToolbarProps {
  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (k: PortfolioSignalKey) => void;
  clearSignals: () => void;
  totalsBySignal: Record<PortfolioSignalKey, number>;
  sortKey: PortfolioSortKey;
  setSortKey: (k: PortfolioSortKey) => void;
  sortOptions: ReturnType<typeof getSortOptions>;
}

function Toolbar({
  selectedSignals,
  toggleSignal,
  clearSignals,
  totalsBySignal,
  sortKey,
  setSortKey,
  sortOptions,
}: ToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);

  useOutsideClose(filterRef, filterOpen, () => setFilterOpen(false));
  useOutsideClose(sortRef, sortOpen, () => setSortOpen(false));

  // Local Shift+F / Shift+S handlers to mirror the kbd hints shown in the
  // trigger pills. Doesn't conflict with the page-level S (sort cycle) or
  // Cmd+S (save defaults) because we gate on shiftKey + !meta + !ctrl.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
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
  }, []);

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
        padding: "16px 0 12px",
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
            sortOptions={sortOptions}
            setSortKey={(k) => {
              setSortKey(k);
              setSortOpen(false);
            }}
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
}: {
  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (k: PortfolioSignalKey) => void;
  clearSignals: () => void;
  totalsBySignal: Record<PortfolioSignalKey, number>;
}) {
  return (
    <div className="pf-pop" style={{ left: 0, minWidth: 360 }}>
      <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid var(--hairline)" }}>
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
      <div style={{ padding: 8, maxHeight: 420, overflowY: "auto" }}>
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
              fontSize: 13,
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
  sortOptions,
  setSortKey,
  anchorRight,
}: {
  sortKey: PortfolioSortKey;
  sortOptions: ReturnType<typeof getSortOptions>;
  setSortKey: (k: PortfolioSortKey) => void;
  anchorRight?: boolean;
}) {
  return (
    <div
      className="pf-pop"
      style={{ ...(anchorRight ? { right: 0 } : { left: 0 }), minWidth: 240 }}
    >
      <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid var(--hairline)" }}>
        <div style={eyebrowStyle}>Sort by</div>
      </div>
      <div style={{ padding: 8, maxHeight: 420, overflowY: "auto" }}>
        {sortOptions.map((o) => {
          const on = o.key === sortKey;
          return (
            <button
              key={o.key}
              onClick={() => setSortKey(o.key)}
              className={`pf-pop-row${on ? " selected" : ""}`}
            >
              <span
                style={{
                  width: 18,
                  color: "var(--moss)",
                  fontSize: 14,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {on ? "✓" : ""}
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
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--green-100)",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <strong style={{ color: "var(--moss)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
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
  setSortKey,
}: {
  sortKey: PortfolioSortKey;
  setSortKey: (k: PortfolioSortKey) => void;
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
    return (
      <button
        onClick={() => setSortKey(target)}
        className={`pf-col-head${sorted ? " sorted" : ""}`}
        style={{ justifySelf: align === "end" ? "end" : "start" }}
      >
        <span>{label}</span>
        <span className="arrow">{sorted ? "▼" : "↕"}</span>
      </button>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: COLS_GRID,
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
      <span style={eyebrowStyle}>Owner</span>
      <span />
    </div>
  );
}

// ---------- Row ----------

function Row({
  row,
  focused,
  onClick,
  isLast,
}: {
  row: PortfolioRow;
  focused: boolean;
  onClick: () => void;
  isLast: boolean;
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

  const owner = row.ownerId ? OWNER_MAP[row.ownerId] : null;
  const initials = ownerInitials(row.ownerName);
  const ownerColor = owner?.color ?? "var(--lichen)";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`pf-row${focused ? " focused" : ""}`}
      style={{
        display: "grid",
        gridTemplateColumns: COLS_GRID,
        gap: 12,
        alignItems: "center",
        padding: "12px 18px",
        borderBottom: isLast ? "none" : "1px solid var(--hairline)",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          padding: "5px 12px",
          borderRadius: 6,
          background: stage.bg,
          color: stage.fg,
          fontFamily: "var(--font-display)",
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          whiteSpace: "nowrap",
          justifySelf: "start",
        }}
      >
        {row.stage}
      </span>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
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
              fontSize: 11.5,
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

      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, justifySelf: "start" }}>
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
            title={extras.map((s) => s.title).join(" · ")}
            style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
          >
            {extras.slice(0, 3).map((s, i) => {
              const meta = signalMetaFor(s.kind, s.title);
              return (
                <span
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: meta.color,
                    display: "inline-block",
                    flex: "0 0 auto",
                  }}
                />
              );
            })}
            {extras.length > 3 && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--green-100)",
                  fontWeight: 500,
                  marginLeft: 2,
                }}
              >
                +{extras.length - 3}
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

      <span
        title={row.ownerName ?? undefined}
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: ownerColor,
          color: "var(--moss)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 700,
          flex: "0 0 auto",
          justifySelf: "start",
        }}
      >
        {initials}
      </span>

      <span className="row-chevron" style={{ fontSize: 14, justifySelf: "end" }}>
        ›
      </span>
    </div>
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
  bad:  { bg: "rgba(184, 74, 45, 0.10)", fg: "var(--rust)" },
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

// ---------- Empty state ----------

function EmptyState() {
  return (
    <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--green-100)" }}>
      <div
        style={{
          fontFamily: "var(--font-editorial)",
          fontStyle: "italic",
          fontSize: 18,
          color: "var(--moss)",
          marginBottom: 8,
        }}
      >
        No accounts match.
      </div>
      <div style={{ fontSize: 13 }}>
        Try removing a filter or clearing your search.
      </div>
    </div>
  );
}

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

function ownerInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

// Mounted flag via useSyncExternalStore. Returns false on the server and on
// the first client render (matching SSR), then true on subsequent renders.
// Mirrors the pattern used in BriefingView for clock-dependent values, which
// avoids hydration mismatch and the react-hooks/set-state-in-effect lint.
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

function useDateLabel(): string {
  const mounted = useMounted();
  if (!mounted) return "";
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function useGreeting(): string {
  const mounted = useMounted();
  if (!mounted) return "";
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
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
    fontSize: 13,
    padding: "8px 14px",
    // Match the TopBar pills + cards radius family (10-14px). The reference
    // shape is a soft rectangle, not a capsule.
    borderRadius: 10,
    cursor: "pointer",
    font: "inherit",
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
  padding: "3px 6px",
  borderRadius: 6,
  border: 0,
  cursor: "pointer",
  font: "inherit",
};
