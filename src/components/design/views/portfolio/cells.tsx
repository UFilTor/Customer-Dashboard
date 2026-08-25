"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { type PortfolioRow } from "@/lib/types";
import { signalStyle, pillText, calmCopy } from "@/lib/signal-display";
import { hubspotCompanyUrl } from "@/lib/hubspot-links";
import { ContactActions } from "../../ContactActions";
import { Icon } from "../../Icon";
import { Tooltip } from "../../Tooltip";
import { quickActionBtn } from "./chrome";
import { SnoozeControl } from "./snooze";

// ---------- Quick actions (shared by KanbanCard + table rows) ----------

// The seven CTA controls, in the order CS reaches for them: call, email,
// WhatsApp, schedule meeting, create task, open in HubSpot, snooze. The first
// five live in the shared <ContactActions /> so the Meeting Prep brief cannot
// drift out of order with this cluster; the last two are Portfolio-only.
// Callers own the layout wrapper (and must stop click/keydown propagation
// when the surrounding row/card is itself clickable - see KanbanCard.tsx and
// PortfolioRow.tsx).
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
      <ContactActions
        dealId={row.dealId}
        contactName={row.contactName ?? null}
        contactEmail={row.contactEmail ?? null}
        contactPhone={row.contactPhone ?? null}
        country={row.companyCountry ?? null}
      />
      <Tooltip label={`Open ${row.name} in HubSpot`}>
        <a
          href={hubspotCompanyUrl(row.id) ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${row.name} in HubSpot`}
          style={quickActionBtn}
        >
          <Icon.External size={13} />
        </a>
      </Tooltip>
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
