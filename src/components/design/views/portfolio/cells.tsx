"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { useState } from "react";
import { type PortfolioRow } from "@/lib/types";
import { signalStyle, pillText, calmCopy } from "@/lib/signal-display";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot-links";
import { Icon } from "../../Icon";
import { quickActionBtn } from "./chrome";
import { SnoozeControl } from "./snooze";

// ---------- Quick actions (shared by KanbanCard + table rows) ----------

// Clipboard copy with a citrus background flash as confirmation. Icon.Check
// is already the glyph for the "Create task" action on this same row, so an
// icon swap would put two identical checkmarks side by side for 1.5s - the
// background flash confirms without that collision and keeps the button's
// footprint fixed so the row never reflows. Mailto fallback if the clipboard
// API is unavailable.
function CopyEmailButton({ email }: { email: string | null }) {
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
      style={{ ...quickActionBtn, background: copied ? "var(--citrus)" : "var(--card-bg)" }}
    >
      <Icon.Mail size={13} />
    </button>
  );
}

// The six CTA controls: copy email, create task, schedule meeting, make
// call, open in HubSpot, snooze. Callers own the layout wrapper (and must
// stop click/keydown propagation when the surrounding row/card is itself
// clickable - see KanbanCard.tsx and PortfolioRow.tsx).
export function QuickActions({
  row,
  snoozedUntil,
  onSnooze,
  onUnsnooze,
}: {
  row: PortfolioRow;
  snoozedUntil: number | null;
  onSnooze: (companyId: string, until: number) => void;
  onUnsnooze: (companyId: string) => void;
}) {
  return (
    <>
      <CopyEmailButton email={row.contactEmail} />
      {row.dealId && (
        <>
          <a
            href={`${hubspotDealUrl(row.dealId) ?? "#"}&interaction=task`}
            target="_blank"
            rel="noopener noreferrer"
            title="Create task"
            aria-label="Create task"
            style={quickActionBtn}
          >
            <Icon.Check size={13} />
          </a>
          <a
            href={`${hubspotDealUrl(row.dealId) ?? "#"}&interaction=schedule`}
            target="_blank"
            rel="noopener noreferrer"
            title="Schedule meeting"
            aria-label="Schedule meeting"
            style={quickActionBtn}
          >
            <Icon.Calendar size={13} />
          </a>
          <a
            href={`${hubspotDealUrl(row.dealId) ?? "#"}&interaction=call`}
            target="_blank"
            rel="noopener noreferrer"
            title="Make call"
            aria-label="Make call"
            style={quickActionBtn}
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
        style={quickActionBtn}
      >
        <Icon.External size={13} />
      </a>
      <SnoozeControl
        row={row}
        snoozedUntil={snoozedUntil}
        onSnooze={onSnooze}
        onUnsnooze={onUnsnooze}
      />
    </>
  );
}

// Stage colours the "no signals" state: an Onboarding row with nothing flagged
// reads differently from an Established row with nothing flagged. Glyph stays
// minimal (matches Health/Revenue/Last null treatment); the title carries the
// stage-specific reading for screen readers and tooltip-on-hover.
export function CalmGlyph({ stage }: { stage: PortfolioRow["stage"] }) {
  const label = calmCopy(stage, "glyph");
  return (
    <span
      title={label}
      aria-label={label}
      style={{ fontSize: 13, color: "var(--green-100)", fontWeight: 500 }}
    >
      ·
    </span>
  );
}

// ---------- Deal status (paused / product hold / hibernation) ----------

const DEAL_STATUS_LABEL: Record<NonNullable<PortfolioRow["dealStatus"]>, string> = {
  paused: "Paused",
  product_hold: "Product hold",
  hibernation: "Hibernation",
};

export function DealStatusTag({ status }: { status: NonNullable<PortfolioRow["dealStatus"]> }) {
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 6,
        background: "var(--lichen)",
        color: "var(--moss)",
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {DEAL_STATUS_LABEL[status]}
    </span>
  );
}

export function SignalPill({
  kind,
  title,
  severity,
}: {
  kind: string;
  title: string;
  severity: "bad" | "warn";
}) {
  // Open invoice is the special case: its WatchOutSignal kind is reused from
  // overdue_invoice but the pill should read as warn (open != overdue).
  // signal-display.ts treats severity as the source of truth, so we compute
  // the effective severity here before delegating.
  const isOpenInvoice = title === "Open invoice";
  const effectiveSeverity = isOpenInvoice ? "warn" : severity;
  const tokens = signalStyle(effectiveSeverity);
  const text = pillText({ kind, title, severity, detail: "" } as never);

  return (
    <span
      title={title}
      aria-label={title}
      style={{
        background: tokens.bg,
        color: tokens.fg,
        border: `1px solid ${tokens.border}`,
        fontSize: 11,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        padding: "1px 7px",
        borderRadius: 6,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: 260,
        // As a flex item the default min-width:auto blocks shrinking, so a
        // long pill would hard-clip at the signals track edge instead of
        // ellipsizing when the column sits at its minmax minimum.
        minWidth: 0,
        display: "inline-block",
        lineHeight: 1.4,
      }}
    >
      {text}
    </span>
  );
}

// Empty state now uses the shared <EditorialEmpty /> primitive so wording
// and rhythm stay consistent with Briefing, Onboarding, and the detail pane.

// ---------- helpers ----------
