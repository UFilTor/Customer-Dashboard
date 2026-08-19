"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { useEffect, type CSSProperties } from "react";
import { type PortfolioRow, type PortfolioSortKey } from "@/lib/types";

// Stage chip palette. Action stages keep a distinct color so the eye finds
// accounts CS needs to touch; healthy steady-state stages collapse to a
// shared neutral beige chip so they glide past without competing for the
// retina the way the rust severity pills do.
export const STAGE_BADGE: Record<PortfolioRow["stage"], { bg: string; fg: string }> = {
  Onboarding:  { bg: "var(--stage-onboarding-bg)", fg: "var(--stage-onboarding-fg)" },
  // Started lives next to a rust signal pill on most rows. Sky-blue keeps
  // "brand new" visible without painting red-on-red.
  Started:     { bg: "var(--sky-blue)",            fg: "var(--moss)" },
  // Healthy steady-state trio: identical neutral chip. Stage column should
  // not pull attention when nothing is wrong.
  Adopted:     { bg: "var(--beige)",               fg: "var(--moss)" },
  "Ramp Up":   { bg: "var(--beige)",               fg: "var(--moss)" },
  Established: { bg: "var(--beige)",               fg: "var(--moss)" },
};

// Universal sort keys that map to clickable column headers.
export const COL_SORT_MAP: Partial<Record<string, PortfolioSortKey>> = {
  stage: "stage",
  name: "name",
  health: "health",
  revenue: "revenue",
  last_contact: "last_contact",
};

// Column grid for header + rows. Two variants based on `showAvatar`:
//
//   STAGE 96 · ACCOUNT clamp · SIGNALS 280 · 1fr spacer · HEALTH 60 · REVENUE 80 · LAST 50 · OWNER 44
//   STAGE 96 · ACCOUNT clamp · SIGNALS 280 · 1fr spacer · HEALTH 60 · REVENUE 80 · LAST 50
//
// ACCOUNT is now a clamped column (220px-360px) instead of a 1fr stretch so
// signals sit close to the account name instead of being pushed to the
// middle. The leftover slack absorbs into a dedicated 1fr spacer between
// signals and the right cluster (HEALTH/REVENUE/LAST/OWNER), keeping that
// cluster pinned to the row's right edge.
export const COLS_GRID_WITH_OWNER = "96px minmax(220px, 360px) 280px 1fr 60px 80px 50px 44px";

export const COLS_GRID_NO_OWNER   = "96px minmax(220px, 360px) 280px 1fr 60px 80px 50px";

export const refineInputStyle: CSSProperties = {
  width: 80,
  padding: "5px 8px",
  borderRadius: 8,
  border: "1px solid var(--hairline-strong)",
  background: "var(--card-bg)",
  color: "var(--moss)",
  fontSize: 12,
  fontVariantNumeric: "tabular-nums",
  // accent-color paints the selected day in the native date picker. Brand
  // green keeps it consistent with the rest of the dashboard chrome.
  accentColor: "var(--moss)",
  colorScheme: "light",
  fontFamily: "var(--font-inter, Inter, system-ui)",
};

export function formatNum(n: number): string {
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

export function useOutsideClose(
  ref: React.RefObject<HTMLDivElement | null>,
  open: boolean,
  close: () => void
) {
  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    // pointerdown covers mouse + touch + pen in one listener (iOS Safari
    // doesn't fire mousedown for outside-tap dismissal reliably).
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open, close, ref]);
}

export function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
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

// DESIGN.md "Label" type: Inter 700 10px +0.06em UPPERCASE. Don't reach for
// var(--font-display) here — Oswald is reserved for actual numerical hero
// moments; using it for every eyebrow drains its display weight.
export const eyebrowStyle: CSSProperties = {
  textTransform: "uppercase",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  color: "var(--green-100)",
};

export function pillTriggerStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    background: "var(--card-bg)",
    border: `1px solid ${active ? "var(--moss)" : "var(--hairline)"}`,
    color: "var(--moss)",
    // Peer chip / pill labels sit at 12px so the trigger reads as inline
    // chrome rather than a body-size element. Don't add `font: inherit` here:
    // the shorthand resets font-size to the inherited value (~16px from body)
    // and silently overrides this fontSize. Family already inherits via
    // `button { font-family: inherit }` in globals.css.
    fontSize: 12,
    lineHeight: 1,
    padding: "8px 14px",
    // Match the TopBar pills + cards radius family (10-14px). The reference
    // shape is a soft rectangle, not a capsule.
    borderRadius: 10,
    cursor: "pointer",
    transition: "border-color 120ms var(--ease-out), background 120ms var(--ease-out)",
  };
}

export const ghostBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "transparent",
  color: "var(--green-100)",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  padding: "3px 6px",
  borderRadius: 6,
  border: 0,
  cursor: "pointer",
};

// ---------- Pagination ----------
