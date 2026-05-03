"use client";

import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  dashboard:
    | "status"
    | "portfolio"
    | "meeting_prep"
    | "pay_migration"
    | "bloom"
    | "search";
  variant: "briefing" | "split";
  hasSelectedCompany: boolean;
}

interface ShortcutGroup {
  heading: string;
  rows: { label: string; keys: string }[];
}

interface Context {
  dashboard: Props["dashboard"];
  variant: Props["variant"];
  hasSelectedCompany: boolean;
}

// Groups always visible (global) and the dashboard-specific groups for the
// current view. Keeps the sheet to a single screen — switch dashboard to
// surface that area's shortcuts.
function groups(modLabel: string, ctx: Context): ShortcutGroup[] {
  const out: ShortcutGroup[] = [];

  out.push({
    heading: "Anywhere",
    rows: [
      { label: "Open command palette", keys: `${modLabel} + K` },
      { label: "Open filter pill", keys: "F" },
      { label: "Cycle filter (All → Region → Person)", keys: "Shift + F" },
      { label: "Refresh active dashboard", keys: "R" },
      { label: "Toggle this help", keys: "?" },
      { label: "Close / go back", keys: "Esc" },
    ],
  });

  out.push({
    heading: "Switch dashboard",
    rows: [
      { label: "Portfolio", keys: "G then P" },
      { label: "Meeting prep", keys: "G then M" },
      { label: "Lookup", keys: "G then L" },
      { label: "Understory Pay Migration", keys: "G then U" },
      { label: "Bloom", keys: "G then B" },
    ],
  });

  if (ctx.hasSelectedCompany) {
    out.push({
      heading: "Company detail",
      rows: [
        { label: "Switch tab (Overview / Activity)", keys: "← / →" },
        { label: "Previous / next activity item", keys: "↑ / ↓" },
        { label: "Expand / collapse focused activity", keys: "Space" },
      ],
    });
    return out;
  }

  if (ctx.dashboard === "status") {
    out.push({
      heading: "Status layouts",
      rows: [
        { label: "Daily briefing", keys: "1" },
        { label: "Split view", keys: "2" },
      ],
    });
    if (ctx.variant === "briefing") {
      out.push({
        heading: "Briefing",
        rows: [
          { label: "Previous / next account", keys: "↑ / ↓" },
          { label: "Open focused account", keys: "Enter" },
          { label: "Return to top from first row", keys: "↑ at first row" },
        ],
      });
    } else if (ctx.variant === "split") {
      out.push({
        heading: "Split view",
        rows: [
          { label: "Previous / next account (auto-opens)", keys: "↑ / ↓" },
        ],
      });
    }
  } else if (ctx.dashboard === "portfolio") {
    out.push({
      heading: "Portfolio",
      rows: [
        { label: "Open Signals filter", keys: "Shift + F" },
        { label: "Toggle signal filter (in popover or list)", keys: "1-8" },
        { label: "Clear all signal filters", keys: "0" },
        { label: "Open Sort menu", keys: "Shift + S" },
        { label: "Cycle sort", keys: "S" },
        { label: "Save current as default", keys: `${modLabel} + S` },
        { label: "Previous / next page", keys: "[ / ]" },
        { label: "Navigate rows", keys: "Up / Down" },
        { label: "Open account", keys: "Enter" },
      ],
    });
    out.push({
      heading: "Inside Signals or Sort popover",
      rows: [
        { label: "Move focus", keys: "Up / Down" },
        { label: "Toggle / apply", keys: "Space" },
        { label: "Apply and close", keys: "Enter" },
        { label: "Close popover", keys: "Esc" },
      ],
    });
  } else if (ctx.dashboard === "meeting_prep") {
    out.push({
      heading: "Meeting prep",
      rows: [
        { label: "Previous / next day (when nothing focused)", keys: "← / →" },
        { label: "Previous / next meeting card", keys: "↑ / ↓" },
        { label: "Enter Previous activity (focused meeting)", keys: "→" },
        { label: "Move within Previous activity", keys: "↑ / ↓" },
        { label: "Toggle expand on focused activity", keys: "Enter / Space" },
        { label: "Back out of Previous activity", keys: "←" },
      ],
    });
  } else if (ctx.dashboard === "pay_migration") {
    out.push({
      heading: "Pay migration",
      rows: [
        { label: "Default view", keys: "1" },
        { label: "All view", keys: "2" },
      ],
    });
  }

  return out;
}

export default function ShortcutCheatSheet({
  isOpen,
  onClose,
  dashboard,
  variant,
  hasSelectedCompany,
}: Props) {
  // Default to Cmd so SSR markup matches the most common case (Mac).
  const [modLabel] = useState(() => {
    if (typeof navigator === "undefined") return "Cmd";
    return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "Cmd" : "Ctrl";
  });

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(2,44,18,0.35)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        animation: "fadeIn 140ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-scaleIn"
        style={{
          width: 420,
          maxWidth: "92vw",
          maxHeight: "82vh",
          overflowY: "auto",
          background: "var(--card-bg)",
          borderRadius: 14,
          padding: "22px 24px",
          boxShadow: "var(--shadow-modal)",
          color: "var(--moss)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "var(--green-100)",
            marginBottom: 6,
          }}
        >
          Keyboard
        </div>
        <h3
          style={{
            margin: "0 0 18px",
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
            fontWeight: 400,
            fontSize: 24,
            letterSpacing: "-0.01em",
          }}
        >
          shortcuts
        </h3>

        {groups(modLabel, { dashboard, variant, hasSelectedCompany }).map((g) => (
          <div key={g.heading} style={{ marginBottom: 18 }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: "var(--green-100)",
                marginBottom: 8,
                paddingBottom: 4,
                borderBottom: "1px solid var(--hairline)",
              }}
            >
              {g.heading}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {g.rows.map((r) => (
                <div
                  key={r.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--dark-moss)" }}>{r.label}</span>
                  <span className="kbd" style={{ fontSize: 11 }}>
                    {r.keys}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
