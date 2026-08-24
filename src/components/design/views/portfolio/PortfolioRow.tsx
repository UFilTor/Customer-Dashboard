"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { memo, type KeyboardEvent, type MouseEvent } from "react";
import { type PortfolioRow } from "@/lib/types";
import { OWNER_MAP } from "@/lib/owners";
import { Avatar } from "../../Avatar";
import { CalmGlyph, DealStatusTag, QuickActions, SignalPill } from "./cells";
import { COLS_GRID_NO_OWNER, COLS_GRID_WITH_OWNER, STAGE_BADGE, formatNum } from "./chrome";
import { SnoozedTag } from "./snooze";

// Wrapped in React.memo because Portfolio renders this hundreds of times.
// `onSelect` is taken as a stable callback (parent useCallbacks it) so the
// memoization stays effective when filter/sort/focused state changes around
// the list. Without memoization an arrow-key focus shift re-renders all
// rendered rows; with memo + stable callback, only the previously-focused
// and newly-focused rows re-render.
export const Row = memo(function Row({
  row,
  focused,
  onSelect,
  isLast,
  showAvatar,
  snoozedUntil,
  onSnooze,
  onUnsnooze,
}: {
  row: PortfolioRow;
  focused: boolean;
  onSelect: (row: PortfolioRow) => void;
  isLast: boolean;
  showAvatar: boolean;
  snoozedUntil: number | null;
  onSnooze: (companyId: string, until: number) => void;
  onUnsnooze: (companyId: string) => void;
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
  // Subtitle priority: invoice info first (due date + amount + count), then
  // no-future-events, then stuck-in-step, else the highest-severity signal.
  const invoiceSignal = safeSignals.find((s) => s.kind === "overdue_invoice");
  const noEventsSignal = safeSignals.find((s) => s.kind === "no_future_events");
  const stuckSignal = safeSignals.find((s) => s.kind === "stuck_in_step");
  const prioritized = invoiceSignal ?? noEventsSignal ?? stuckSignal;
  const stuckDetail = prioritized
    ? prioritized.kind === "stuck_in_step"
      ? prioritized.title
      : prioritized.detail
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

  // Without this, the button's accessible name defaults to its concatenated
  // text content — every cell run together with no separators or column
  // context ("Ramp UpFlygupplevelseInvoice overdue 3 days..."). Explicit
  // sentences with periods give a screen reader real pause points.
  const rowAriaLabel = [
    row.name,
    `${row.stage} stage`,
    safeSignals.length > 0
      ? safeSignals.map((s) => s.title).join(". ")
      : "No signals flagged",
    row.healthScore != null ? `Health ${Math.round(row.healthScore)}` : null,
    row.revenue ? `${formatNum(row.revenue)} EUR ACV` : null,
    row.daysSinceContact != null ? `Last contact ${row.daysSinceContact} days ago` : null,
  ]
    .filter(Boolean)
    .join(". ");

  // Resolve to an OwnerLike for the shared Avatar. Falls back to a synthetic
  // { name } if the row carries an ownerName but no canonical map entry, so
  // the initial still renders.
  const owner = row.ownerId ? OWNER_MAP[row.ownerId] : null;
  const ownerForAvatar = owner ?? (row.ownerName ? { name: row.ownerName } : null);

  // The row holds real <button>/<a> quick-action controls now, and those
  // can't legally nest inside a <button>. Same pattern as KanbanCard.tsx and
  // clickableRowProps() in PayMigrationView.tsx: a role="button" div with a
  // manual Enter/Space handler. globals.css's :focus-visible already covers
  // [role="button"], so the focus ring is unchanged.
  const onRowKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(row);
    }
  };

  // The quick-action cell's own buttons/links must not trigger the row's
  // click-to-open behavior. Stopping propagation once on the cell covers
  // both mouse clicks and Enter/Space presses.
  const stopRowPropagation = {
    onClick: (e: MouseEvent<HTMLDivElement>) => e.stopPropagation(),
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => e.stopPropagation(),
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row)}
      onKeyDown={onRowKeyDown}
      aria-label={rowAriaLabel}
      className={`pf-row${focused ? " focused" : ""}`}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: showAvatar ? COLS_GRID_WITH_OWNER : COLS_GRID_NO_OWNER,
        gap: 12,
        alignItems: "center",
        width: "100%",
        padding: "12px 18px",
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
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
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
        {row.dealStatus && <DealStatusTag status={row.dealStatus} />}
        {snoozedUntil != null && <SnoozedTag until={snoozedUntil} />}
      </div>

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
                aria-label={`${safeSignals.length - 3} more signal${
                  safeSignals.length - 3 === 1 ? "" : "s"
                }: ${safeSignals.slice(3).map((s) => s.title).join(", ")}`}
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

      {/* Quick actions - same glyph cluster as the kanban card (QuickActions
          in cells.tsx). Right-aligned so a shorter cluster (no email / no
          deal) still hugs the row's right edge. */}
      <div
        style={{ display: "inline-flex", gap: 5, justifySelf: "end" }}
        {...stopRowPropagation}
      >
        <QuickActions
          row={row}
          snoozedUntil={snoozedUntil}
          onSnooze={onSnooze}
          onUnsnooze={onUnsnooze}
        />
      </div>
    </div>
  );
});

// ---------- Row snooze control ----------
