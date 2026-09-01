"use client";

// Shared interaction props for any row / card / cell that opens a company
// detail. One helper so every list in the app answers a middle click and a
// Cmd/Ctrl click the same way, and so the keyboard contract can't drift
// between them.
//
// Why not a real <a href>: these rows carry their own <button>/<a> quick
// actions, and neither a <button> nor an <a> may legally nest inside an <a>.
// So the row stays a role="button" div (see PortfolioRow.tsx) and we translate
// the new-tab gestures by hand. globals.css's :focus-visible already covers
// [role="button"], so the focus ring comes for free.

import type { KeyboardEvent, MouseEvent } from "react";
import { isNewTabClick, openCompanyInNewTab } from "@/lib/company-link";

export interface CompanyOpenPropsOptions {
  /**
   * HubSpot company id, or null when the row can't resolve one synchronously
   * (Pay Migration falls back to an async name search, Lookup rows may carry
   * only a HubSpot URL). Null keeps the row's plain-click behavior and skips
   * the new-tab gestures, since there is no href to open.
   */
  companyId: string | null;
  /** Accessible name for the row. */
  label: string;
  /**
   * Same-tab open — the existing SPA navigation. Undefined means the row is
   * not actionable at all.
   */
  onOpen?: (() => void) | undefined;
}

export interface CompanyOpenProps {
  role: "button";
  tabIndex: 0;
  "aria-label": string;
  onClick: (e: MouseEvent<HTMLElement>) => void;
  onAuxClick?: (e: MouseEvent<HTMLElement>) => void;
  onMouseDown?: (e: MouseEvent<HTMLElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Spread onto the clickable element. Returns `{}` when there is no open
 * handler at all, so a non-actionable row doesn't become a dead tab stop —
 * same convention as the old clickableRowProps() in PayMigrationView.tsx.
 */
export function companyOpenProps(
  opts: CompanyOpenPropsOptions
): CompanyOpenProps | Record<string, never> {
  const { companyId, label, onOpen } = opts;
  if (!onOpen) return {};

  const openNewTab = (e: MouseEvent<HTMLElement>) => {
    if (!companyId) return false;
    e.preventDefault();
    e.stopPropagation();
    openCompanyInNewTab(companyId);
    return true;
  };

  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    onClick: (e) => {
      if (isNewTabClick(e) && openNewTab(e)) return;
      onOpen();
    },
    onAuxClick: (e) => {
      if (e.button === 1) openNewTab(e);
    },
    // Middle mousedown is what triggers Chrome's autoscroll cursor on
    // Windows/Linux; suppressing it here keeps the aux click clean.
    onMouseDown: (e) => {
      if (e.button === 1 && companyId) e.preventDefault();
    },
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

/**
 * Spread onto a wrapper around nested controls (quick actions) so activating
 * one never also triggers the row's own open behavior. Covers every gesture
 * companyOpenProps listens for, not just click + keydown — without the aux and
 * mousedown stoppers, middle-clicking the HubSpot glyph inside a row would
 * open two tabs.
 */
export const stopRowActivation = {
  onClick: (e: MouseEvent<HTMLElement>) => e.stopPropagation(),
  onAuxClick: (e: MouseEvent<HTMLElement>) => e.stopPropagation(),
  onMouseDown: (e: MouseEvent<HTMLElement>) => e.stopPropagation(),
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => e.stopPropagation(),
};
