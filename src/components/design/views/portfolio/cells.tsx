"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type PortfolioRow } from "@/lib/types";
import { signalStyle, pillText, calmCopy } from "@/lib/signal-display";
import { hubspotCompanyUrl } from "@/lib/hubspot-links";
import { ContactActions } from "../../ContactActions";
import { Icon } from "../../Icon";
import { Tooltip } from "../../Tooltip";
import { quickActionBtn } from "./chrome";
import { SnoozeControl } from "./snooze";
import { stopRowActivation } from "../company-row-props";

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

const OVERFLOW_POP_MAX_WIDTH = 300;

// Below the trigger, left-aligned, clamped so the popover stays on screen.
function overflowPopPos(trigger: HTMLElement): { top: number; left: number } {
  const r = trigger.getBoundingClientRect();
  return {
    top: r.bottom + 6,
    left: Math.max(8, Math.min(r.left, window.innerWidth - OVERFLOW_POP_MAX_WIDTH - 8)),
  };
}

// "+N" after the inline signal pills. A real button so keyboard and touch
// users can read the hidden signals (the old hover title reached neither).
// Same portal + outside-close + popup-state contract as SnoozeControl; the
// portal escapes the signals cell's overflow:hidden. stopRowActivation on the
// wrapper matters because React events bubble through the portal: without it
// a click or Enter here would also open the company detail.
export function SignalOverflow({
  signals,
  companyName,
}: {
  signals: Array<{ kind: string; title: string; severity: "bad" | "warn" }>;
  companyName: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const popId = useId();
  const n = signals.length;

  function toggle() {
    if (!open && triggerRef.current) setPos(overflowPopPos(triggerRef.current));
    setOpen((v) => !v);
  }

  // Track scroll/resize while open so the fixed popover follows the row.
  useEffect(() => {
    if (!open) return;
    function place() {
      if (triggerRef.current) setPos(overflowPopPos(triggerRef.current));
    }
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Outside-close checks both the trigger and the portal'd popover. Esc
  // closes and puts focus back on the trigger. The keydown listener runs in
  // the capture phase because stopRowActivation stops the bubbling keydown
  // at React's root, so a bubble-phase window listener never sees an Esc
  // pressed while the trigger has focus.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (triggerRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Yield the page-level ↑/↓/Enter row-nav while open. Dispatch only while
  // open: a closed popover that announced `false` on mount would clobber the
  // flag of a toolbar dropdown that is still open (rows mount as filters
  // change). The cleanup covers close and the row unmounting while open.
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent("ud-portfolio-popup-state", { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent("ud-portfolio-popup-state", { detail: false }));
    };
  }, [open]);

  return (
    // Padding gives the 2px + 2px-offset focus ring room inside the signals
    // cell, which clips overflow. The Account cell is taller, so row height
    // doesn't change.
    <span {...stopRowActivation} style={{ display: "inline-flex", flexShrink: 0, padding: "4px 4px 4px 0" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`Show ${n} more signal${n === 1 ? "" : "s"} for ${companyName}`}
        style={{
          fontFamily: "inherit",
          fontSize: 10,
          fontWeight: 600,
          lineHeight: 1.4,
          color: "var(--green-100)",
          background: "transparent",
          border: 0,
          borderRadius: 4,
          padding: "1px 4px",
          cursor: "pointer",
        }}
      >
        +{n}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            id={popId}
            role="dialog"
            aria-label={`More signals for ${companyName}`}
            className="pf-pop"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: "max-content",
              minWidth: 0,
              maxWidth: OVERFLOW_POP_MAX_WIDTH,
              zIndex: 200,
              padding: 10,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
            }}
          >
            {signals.map((s, i) => (
              <SignalPill key={`${s.kind}:${i}`} kind={s.kind} title={s.title} severity={s.severity} />
            ))}
          </div>,
          document.body
        )}
    </span>
  );
}

// Empty state now uses the shared <EditorialEmpty /> primitive so wording
// and rhythm stay consistent with Briefing, Onboarding, and the detail pane.

// ---------- helpers ----------
