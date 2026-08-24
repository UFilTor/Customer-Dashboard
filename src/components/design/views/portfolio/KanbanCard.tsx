"use client";

// Kanban board card. Mirrors the visual language of PortfolioRow.tsx (name
// weight, ACV formatting, signal pills) but reshaped for a vertical card
// instead of a grid row. Presentation only, no data fetching.

import { memo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { type PortfolioRow } from "@/lib/types";
import { OWNER_MAP } from "@/lib/owners";
import { fmtEur } from "@/lib/format-design";
import { KANBAN_COLUMNS, buildKanbanCard, type KanbanColumnKey } from "@/lib/portfolio-kanban";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot-links";
import { Avatar } from "../../Avatar";
import { Icon } from "../../Icon";
import { DealStatusTag, SignalPill } from "./cells";

// Compact square icon-button variant of CompanyDetail.tsx's quickActionBtn.
// The card is ~240-300px wide and needs five actions on one line, so this
// drops the text label entirely and keeps only a centered glyph - each
// control still carries its full name via title/aria-label (see usages
// below), so the glyph-only presentation loses no accessible information.
const cardActionBtn: React.CSSProperties = {
  width: 27,
  height: 27,
  flexShrink: 0,
  borderRadius: 8,
  border: "1px solid var(--hairline)",
  background: "var(--card-bg)",
  color: "var(--moss)",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

// Local compact copy - CompanyDetail.tsx's CopyEmailButton isn't exported
// and this task's file allowlist doesn't include CompanyDetail.tsx, so the
// clean extraction path (export + shared module) isn't available here.
// Behavior (clipboard write, "Copied!" flash, mailto fallback) mirrors it;
// the flash itself is a brief citrus background swap rather than an icon
// swap. Icon.Check is already the glyph for the "Create task" action on
// this same row, so reusing it here would put two identical checkmarks
// side by side for 1.5s - the background flash (same pattern as the
// bookmark toggle in CompanyDetail.tsx) gives a clear, unambiguous
// confirmation without that collision, and keeps the button's footprint
// fixed so the row never reflows.
function CardCopyEmailButton({ email }: { email: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!email) return null;
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.location.href = `mailto:${email}`;
    }
  };
  const label = copied ? `Copied ${email}` : `Copy ${email}`;
  return (
    <button
      type="button"
      onClick={onCopy}
      title={label}
      aria-label={label}
      style={{ ...cardActionBtn, background: copied ? "var(--citrus)" : "var(--card-bg)" }}
    >
      <Icon.Mail size={13} />
    </button>
  );
}

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
  // clickableRowProps() in PayMigrationView.tsx: a role="button" div with a
  // manual Enter/Space handler. globals.css's :focus-visible already
  // covers [role="button"], so the focus ring is unchanged.
  const onCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(row);
    }
  };

  // The quick-action row's own buttons/links must not trigger the card's
  // click-to-open behavior. Stopping propagation once here (rather than on
  // every individual action) covers both mouse clicks and Enter/Space
  // presses that would otherwise bubble up to onCardKeyDown/onClick above.
  const stopRowPropagation = {
    onClick: (e: MouseEvent<HTMLDivElement>) => e.stopPropagation(),
    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => e.stopPropagation(),
  };

  return (
    <div
      role="button"
      tabIndex={0}
      data-row-index={flatIndex}
      aria-label={ariaLabel}
      onClick={() => onClick(row)}
      onKeyDown={onCardKeyDown}
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

      {/* Quick-action row, mirrors CompanyDetail.tsx's header actions at
          card scale - glyph-only so all five fit on one line. Wrapped with
          stopRowPropagation so clicking or keying an action here never
          triggers the card's own onClick. No flex-wrap: the fixed-width
          icon buttons are sized to always fit this row. */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 5,
          marginTop: 8,
          paddingTop: 8,
          borderTop: "1px solid var(--hairline)",
        }}
        {...stopRowPropagation}
      >
        <CardCopyEmailButton email={row.contactEmail} />
        {row.dealId && (
          <>
            <a
              href={`${hubspotDealUrl(row.dealId) ?? "#"}&interaction=task`}
              target="_blank"
              rel="noopener noreferrer"
              title="Create task"
              aria-label="Create task"
              style={cardActionBtn}
            >
              <Icon.Check size={13} />
            </a>
            <a
              href={`${hubspotDealUrl(row.dealId) ?? "#"}&interaction=schedule`}
              target="_blank"
              rel="noopener noreferrer"
              title="Schedule meeting"
              aria-label="Schedule meeting"
              style={cardActionBtn}
            >
              <Icon.Calendar size={13} />
            </a>
            <a
              href={`${hubspotDealUrl(row.dealId) ?? "#"}&interaction=call`}
              target="_blank"
              rel="noopener noreferrer"
              title="Make call"
              aria-label="Make call"
              style={cardActionBtn}
            >
              <Icon.Phone size={13} />
            </a>
          </>
        )}
        <a
          href={hubspotCompanyUrl(row.id) ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in HubSpot"
          aria-label="Open in HubSpot"
          style={cardActionBtn}
        >
          <Icon.External size={13} />
        </a>
      </div>
    </div>
  );
});
