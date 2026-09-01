"use client";

// Kanban board card. Mirrors the visual language of PortfolioRow.tsx (name
// weight, ACV formatting, signal pills) but reshaped for a vertical card
// instead of a grid row. Presentation only, no data fetching.

import { memo, useState, type CSSProperties } from "react";
import { type PortfolioRow } from "@/lib/types";
import { OWNER_MAP } from "@/lib/owners";
import { fmtEur } from "@/lib/format-design";
import { KANBAN_COLUMNS, buildKanbanCard, type KanbanColumnKey } from "@/lib/portfolio-kanban";
import { Avatar } from "../../Avatar";
import { DealStatusTag, QuickActions, SignalPill } from "./cells";
import { companyOpenProps, stopRowActivation } from "../company-row-props";

interface KanbanCardProps {
  row: PortfolioRow;
  columnKey: KanbanColumnKey;
  nowIso: string;
  focused: boolean;
  showAvatar: boolean;
  // Position within the column-major flat order the container keeps focus
  // state in. Exposed as data-row-index so keyboard nav can scrollIntoView
  // the right card, same convention PortfolioRow.tsx's table rows use.
  flatIndex: number;
  onClick: (row: PortfolioRow) => void;
  snoozedUntil: number | null;
  onSnooze: (companyId: string, until: number) => void;
  onUnsnooze: (companyId: string) => void;
}

// Wrapped in React.memo: a board can render well over a hundred cards
// across all columns, same reasoning as the table's Row.
export const KanbanCard = memo(function KanbanCard({
  row,
  columnKey,
  nowIso,
  focused,
  showAvatar,
  flatIndex,
  onClick,
  snoozedUntil,
  onSnooze,
  onUnsnooze,
}: KanbanCardProps) {
  // Hover is local component state rather than a direct DOM-style mutation
  // in onMouseEnter/onMouseLeave. That keeps every border property as a
  // React-owned longhand (borderColor/borderWidth/borderStyle) with no
  // shorthand `border` anywhere in the style object, so there is nothing to
  // conflict with per the React 19 shorthand/longhand rule in AGENTS.md.
  const [hovered, setHovered] = useState(false);

  const card = buildKanbanCard(row, columnKey, nowIso);
  const def = KANBAN_COLUMNS.find((c) => c.key === columnKey);
  const mode = def?.fields ?? "ongoing";
  // buildKanbanCard already nulls out fields that don't apply to this
  // column's mode, but a null obMeetingLabel/lastTouchLabel is ambiguous
  // between "not applicable" and "applicable but no data" (see
  // portfolio-kanban.ts). These two flags resolve that so the "Not booked" /
  // "No touch logged" fallback text only shows on columns where it's
  // meaningful.
  const showObMeeting = mode === "early" || mode === "experience";
  const showLastTouch = mode === "ongoing";

  // Defensive default, same convention as PortfolioRow.tsx's safeSignals.
  const safeSignals = Array.isArray(row.signals) ? row.signals : [];

  const owner = row.ownerId ? OWNER_MAP[row.ownerId] : null;
  const ownerForAvatar = owner ?? (row.ownerName ? { name: row.ownerName } : null);

  // The visible card body only shows the column-mode lines that apply (see
  // showObMeeting/showLastTouch above); the aria-label mirrors exactly the
  // same set plus the name/column/ACV, so a screen reader hears everything
  // a sighted user sees, not just the name and column.
  const ariaLines: string[] = [`${row.name}, ${def?.label ?? row.stage} column`, `${fmtEur(row.revenue)} ACV`];
  if (showObMeeting) ariaLines.push(`OB meeting: ${card.obMeetingLabel ?? "Not booked"}`);
  if (card.experiencesLabel !== null) ariaLines.push(card.experiencesLabel);
  if (card.firstEventLabel !== null) ariaLines.push(card.firstEventLabel);
  if (showLastTouch) ariaLines.push(`Last touch: ${card.lastTouchLabel ?? "No touch logged"}`);
  if (card.nextMeetingLabel !== null) ariaLines.push(`Next meeting: ${card.nextMeetingLabel}`);
  if (card.nextActivityLabel !== null) ariaLines.push(`Next: ${card.nextActivityLabel}`);
  if (card.nextStep !== null) {
    ariaLines.push(card.nextActivityLabel !== null ? card.nextStep : `Next: ${card.nextStep}`);
  }
  const ariaLabel = ariaLines.join(". ");

  const borderColor = focused ? "var(--moss)" : hovered ? "var(--beige-gray)" : "var(--hairline)";

  // Card holds real <button>/<a> action controls now (quick-action row
  // below), and those can't legally nest inside a <button>. Same pattern as
  // PortfolioRow.tsx and PayMigrationView.tsx's rows: a role="button" div
  // with a manual Enter/Space handler, plus the middle- / Cmd-click new-tab
  // gestures. globals.css's :focus-visible already covers [role="button"],
  // so the focus ring is unchanged. See company-row-props.ts.
  const openProps = companyOpenProps({
    companyId: row.id,
    label: ariaLabel,
    onOpen: () => onClick(row),
  });

  return (
    <div
      {...openProps}
      data-row-index={flatIndex}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor,
        borderRadius: 16,
        background: focused ? "var(--beige-new)" : "var(--card-bg)",
        boxShadow: focused ? "inset 3px 0 0 var(--moss)" : "none",
        padding: "12px 14px",
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
        transition: "border-color 120ms var(--ease-out), background 120ms var(--ease-out)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: focused ? 600 : 500,
            color: "var(--moss)",
            letterSpacing: "-0.005em",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {row.name}
        </span>
        {showAvatar && <Avatar owner={ownerForAvatar} size={20} />}
      </div>

      <div style={{ fontSize: 12, color: "var(--green-100)", marginTop: 4, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
        <span style={{ fontWeight: 700, color: "var(--moss)" }}>{fmtEur(row.revenue)}</span> ACV
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8 }}>
        {showObMeeting && (
          <div style={{ fontSize: 12, color: "var(--green-100)" }}>
            OB meeting: {card.obMeetingLabel ?? "Not booked"}
          </div>
        )}
        {card.experiencesLabel !== null && (
          <div style={{ fontSize: 12, color: "var(--green-100)" }}>{card.experiencesLabel}</div>
        )}
        {card.firstEventLabel !== null && (
          <div style={{ fontSize: 12, color: "var(--green-100)" }}>{card.firstEventLabel}</div>
        )}
        {showLastTouch && (
          <div style={{ fontSize: 12, color: "var(--green-100)" }}>
            Last touch: {card.lastTouchLabel ?? "No touch logged"}
          </div>
        )}
        {card.nextMeetingLabel !== null && (
          <div style={{ fontSize: 12, color: "var(--green-100)" }}>Next meeting: {card.nextMeetingLabel}</div>
        )}
        {card.nextActivityLabel !== null && (
          <div style={{ fontSize: 12, color: "var(--green-100)" }}>Next: {card.nextActivityLabel}</div>
        )}
        {card.nextStep !== null && (
          <div
            style={{
              fontSize: 12,
              color: "var(--green-100)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {card.nextActivityLabel !== null ? card.nextStep : `Next: ${card.nextStep}`}
          </div>
        )}
      </div>

      {(safeSignals.length > 0 || row.dealStatus) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
          {row.dealStatus && <DealStatusTag status={row.dealStatus} />}
          {safeSignals.map((s, i) => (
            <SignalPill key={`${s.kind}:${i}`} kind={s.kind} title={s.title} severity={s.severity} />
          ))}
        </div>
      )}

      {/* Quick-action row - shared QuickActions cluster (cells.tsx), also
          used by the table rows. Wrapped with stopRowActivation so clicking
          or keying an action here never triggers the card's own onClick. No
          flex-wrap: the buttons always fit this row, but only because the
          cluster is shrunk here - seven table-sized 27px buttons overflow a
          card in a 240px-minimum column, so --qa-size trims them to 23. */}
      <div
        style={{
          display: "flex",
          // space-between, not center: the seven buttons only just fit the
          // narrowest column, so the row distributes whatever slack the card
          // actually has instead of assuming a fixed gap that overflows.
          justifyContent: "space-between",
          gap: 2,
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid var(--hairline)",
          ["--qa-size" as string]: "23px",
        } as CSSProperties}
        {...stopRowActivation}
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
