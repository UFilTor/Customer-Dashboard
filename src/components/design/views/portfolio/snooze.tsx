"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type PortfolioRow } from "@/lib/types";
import { DatePopover } from "../../DatePopover";
import { Icon } from "../../Icon";
import { Tooltip } from "../../Tooltip";
import { eyebrowStyle, quickActionBtn } from "./chrome";

const SNOOZE_PRESETS: Array<{ label: string; days: number }> = [
  { label: "1 day", days: 1 },
  { label: "2 days", days: 2 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

function fmtSnoozeDate(until: number): string {
  const d = new Date(until);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Module scope (not inside the component) — the React Compiler purity rule
// flags Date.now() in render-scoped functions, but these only ever run from
// event handlers.
function untilFromDays(days: number): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

// "Snooze until <date>" = hidden through the day before, back in the
// portfolio on the chosen day. Null when the date is invalid or in the past.
function untilFromDate(value: string): number | null {
  const until = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(until) && until > Date.now() ? until : null;
}

// Snooze quick action: a glyph button in the QuickActions cluster (table
// rows and kanban cards). Snoozing hides the company from Portfolio until
// the chosen date (the Status pill can toggle snoozed rows back in). The
// menu portals to <body> because the rows/columns containers clip overflow.
export function SnoozeControl({
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
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState<string | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Place the portal'd menu under the trigger; track scroll/resize while open.
  useEffect(() => {
    if (!open) return;
    function place() {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 224) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Outside-close has to check both the trigger and the portal'd menu
  // (useOutsideClose only watches one subtree — same caveat as
  // StageMultiSelect). Escape closes too.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Yield the page-level row-nav shortcuts while the menu is open. The
  // cleanup matters: picking a preset snoozes the row, which filters it out
  // and unmounts this control while the menu is still open - without the
  // false dispatch, page-client's popup flag would stay stuck and kill
  // arrow/Enter list navigation across all of Portfolio.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-portfolio-popup-state", { detail: open })
    );
    return () => {
      if (open) {
        window.dispatchEvent(
          new CustomEvent("ud-portfolio-popup-state", { detail: false })
        );
      }
    };
  }, [open]);

  function snoozeDays(days: number) {
    onSnooze(row.id, untilFromDays(days));
    setOpen(false);
  }

  function snoozeUntilDate(value: string | undefined) {
    setCustomDate(value);
    if (!value) return;
    const until = untilFromDate(value);
    if (until == null) return;
    onSnooze(row.id, until);
    setOpen(false);
    setCustomDate(undefined);
  }

  if (snoozedUntil != null) {
    // Citrus fill marks the active snooze; clicking wakes the company up.
    return (
      <Tooltip label={`Snoozed until ${fmtSnoozeDate(snoozedUntil)} - click to unsnooze`}>
        <button
          type="button"
          onClick={() => onUnsnooze(row.id)}
          aria-label={`Unsnooze ${row.name} (snoozed until ${fmtSnoozeDate(snoozedUntil)})`}
          style={{ ...quickActionBtn, background: "var(--citrus)" }}
        >
          <Icon.Moon size={13} />
        </button>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip label={`Snooze ${row.name}`}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={`Snooze ${row.name}`}
          aria-expanded={open}
          style={quickActionBtn}
        >
          <Icon.Moon size={13} />
        </button>
      </Tooltip>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Snooze ${row.name}`}
            className="pf-pop"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: 216, zIndex: 200 }}
          >
            <div
              style={{
                padding: "10px 14px 8px 20px",
                borderBottom: "1px solid var(--hairline)",
              }}
            >
              <div style={eyebrowStyle}>Snooze for</div>
            </div>
            <div style={{ padding: 6 }}>
              {SNOOZE_PRESETS.map((p) => (
                <button
                  key={p.days}
                  className="pf-pop-row"
                  onClick={() => snoozeDays(p.days)}
                >
                  <span style={{ flex: 1, textAlign: "left" }}>{p.label}</span>
                </button>
              ))}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px 6px",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--green-100)", whiteSpace: "nowrap" }}>
                  Until date
                </span>
                <DatePopover
                  value={customDate}
                  onChange={snoozeUntilDate}
                  ariaLabel={`Snooze ${row.name} until date`}
                  placeholder="Pick a date"
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

// Mirrors DealStatusTag's chip treatment — only visible when snoozed rows are
// toggled back in via the Status pill.
export function SnoozedTag({ until }: { until: number }) {
  return (
    <span
      style={{
        padding: "3px 8px",
        borderRadius: 6,
        background: "var(--beige)",
        color: "var(--green-100)",
        fontSize: 9,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      Zzz {fmtSnoozeDate(until)}
    </span>
  );
}

// ---------- Stage-dependent calm glyph ----------
