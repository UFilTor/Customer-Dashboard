"use client";

import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  heading: string;
  rows: { label: string; keys: string }[];
}

function groups(modLabel: string): ShortcutGroup[] {
  return [
    {
      heading: "Anywhere",
      rows: [
        { label: "Open command palette", keys: `${modLabel} + K` },
        { label: "Toggle this help", keys: "?" },
        { label: "Close / go back", keys: "Esc" },
      ],
    },
    {
      heading: "Switch dashboard",
      rows: [
        { label: "Status", keys: "G then S" },
        { label: "Onboarding", keys: "G then O" },
        { label: "Retention", keys: "G then R" },
        { label: "Pay migration", keys: "G then P" },
        { label: "Bloom", keys: "G then B" },
      ],
    },
    {
      heading: "Status layouts",
      rows: [
        { label: "Daily briefing", keys: "1" },
        { label: "Split view", keys: "2" },
        { label: "By signal", keys: "3" },
      ],
    },
    {
      heading: "Split view",
      rows: [
        { label: "Previous / next account", keys: "↑ / ↓" },
      ],
    },
    {
      heading: "Onboarding",
      rows: [
        { label: "Meeting prep", keys: "1" },
        { label: "Needs attention", keys: "2" },
        { label: "Previous / next day (meeting prep)", keys: "← / →" },
      ],
    },
    {
      heading: "Company detail",
      rows: [
        { label: "Switch tab (Overview / Activity)", keys: "← / →" },
        { label: "Previous / next activity item", keys: "↑ / ↓" },
      ],
    },
  ];
}

export default function ShortcutCheatSheet({ isOpen, onClose }: Props) {
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
          background: "#fff",
          borderRadius: 14,
          padding: "22px 24px",
          boxShadow: "0 30px 80px rgba(2,44,18,0.35)",
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

        {groups(modLabel).map((g) => (
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
