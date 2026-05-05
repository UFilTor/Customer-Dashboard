// Shared display helpers for the watch-out signal taxonomy.
//
// Both Portfolio (table-row Signals column) and Meeting Prep (per-card Watch
// out for block) consume the same `WatchOutSignal[]` payload, but render in
// different physical containers — pills inline vs. cards stacked. The data,
// palette decisions, and copy decisions live here so the two surfaces never
// drift. The components only own layout.
//
// Anything in this module is pure: input -> string / style object. No JSX,
// no React, importable from server code if needed.

import { PORTFOLIO_SIGNAL_MAP } from "./signals";
import type {
  PortfolioSignalKey,
  PortfolioStage,
  WatchOutSignal,
  WatchOutSignalSeverity,
} from "./types";

// ---------- Severity palette ----------

// "fill"   — solid rust background + cream text. Used by the Portfolio bad
//            severity pill and the Meeting Prep bad severity card.
// "border" — transparent background + rust border + rust text. Used by the
//            warn severity pill / card across both dashboards.
//
// Mixed treatment is intentional (DESIGN.md): bad shouts, warn retreats. The
// caller picks fill vs. border based on the signal's severity.
export type SignalSurface = "fill" | "border";

export interface SignalStyleTokens {
  bg: string;
  fg: string;
  border: string;
  // Title-only color for callers that paint the title differently from the
  // body (Meeting Prep cards do this — title in rust, body in moss).
  titleFg: string;
}

export function severitySurface(severity: WatchOutSignalSeverity): SignalSurface {
  return severity === "bad" ? "fill" : "border";
}

export function signalStyle(severity: WatchOutSignalSeverity): SignalStyleTokens {
  if (severity === "bad") {
    return {
      bg: "var(--rust)",
      fg: "var(--rust-fg)",
      border: "var(--rust)",
      titleFg: "var(--rust-fg)",
    };
  }
  return {
    bg: "transparent",
    fg: "var(--rust)",
    border: "var(--rust)",
    titleFg: "var(--rust)",
  };
}

// ---------- Copy ----------

// Compressed pill copy for tight spaces (Portfolio Signals column). 2-3 words.
// Falls back to the full title when no compression rule applies.
export function pillText(signal: WatchOutSignal): string {
  const { kind, title } = signal;
  if (title === "Open invoice") return "Open invoice";
  if (kind === "overdue_invoice") {
    return title.replace("Invoice overdue ", "").replace(" days", "d") || title;
  }
  if (kind === "wish_to_churn")    return "Wish to churn";
  if (kind === "volume_declining") return "Volume declining";
  if (kind === "no_future_events") return "No future events";
  if (kind === "stuck_in_step")    return title;
  if (kind === "health_dropped")   return title.replace("Health score ", "Health ");
  if (kind === "gone_quiet")       return title.replace("Last contact ", "Quiet ");
  if (kind === "not_on_pay")       return "Not on Pay";
  return title;
}

// Full copy for the Meeting Prep WatchOutFor card. Returns title + detail
// pre-split so the consumer can render them in different colors / weights.
export function cardCopy(signal: WatchOutSignal): { title: string; detail: string } {
  return { title: signal.title, detail: signal.detail };
}

// ---------- Stage-dependent calm copy ----------

// "glyph" — single mid-dot for table-row null cells. The label travels via
//           title/aria-label so screen-reader users still hear the stage cue.
// "sentence" — a full italic sentence for the Meeting Prep WatchOutFor empty
//              state, one breath ("Steady. Nothing flagged.").
export type CalmRender = "glyph" | "sentence";

const CALM_LABEL: Record<PortfolioStage, string> = {
  Onboarding:  "On track",
  Started:     "Settling in",
  Adopted:     "In progress",
  "Ramp Up":   "Ramping",
  Established: "Steady",
};

export function calmCopy(stage: PortfolioStage, render: CalmRender): string {
  const label = CALM_LABEL[stage];
  return render === "glyph" ? label : `${label}. Nothing flagged.`;
}

// ---------- Signal -> PortfolioSignalKey ----------

// Mirrors src/lib/portfolio.ts:mapKindToKey. Centralized here so any new
// caller can map a WatchOutSignal back to its filterable key without
// pulling in portfolio.ts (which carries HubSpot fetch code).
export function signalKey(signal: WatchOutSignal): PortfolioSignalKey {
  if (signal.title === "Open invoice") return "open_invoices";
  switch (signal.kind) {
    case "overdue_invoice":   return "overdue_invoices";
    case "wish_to_churn":     return "wish_to_churn";
    case "volume_declining":  return "volume_declining";
    case "no_future_events":  return "no_future_events";
    case "stuck_in_step":     return "stuck_in_step";
    case "health_dropped":    return "health_dropped";
    case "gone_quiet":        return "gone_quiet";
    case "not_on_pay":        return "not_on_pay";
    default:                  return "gone_quiet";
  }
}

// Re-export the meta lookup so callers don't need a second import for
// label / short-label / brand color.
export const signalMeta = (signal: WatchOutSignal) =>
  PORTFOLIO_SIGNAL_MAP[signalKey(signal)];
