"use client";

import type { WatchOutSignal } from "@/lib/types";

// Shared "Watch out for" renderer used by Meeting prep + Onboarding briefs.
// DESIGN.md bans colored side stripes thicker than 1px — earlier versions of
// this card had a 3px borderLeft, which we replaced with a full hairline +
// a leading severity dot so the signal still reads at a glance without
// cribbing the generic notification-card idiom.
export function WatchOutFor({ signals }: { signals: WatchOutSignal[] }) {
  if (signals.length === 0) {
    return (
      <div style={{ opacity: 0.5, fontSize: 12, fontStyle: "italic" }}>
        Nothing flagged.
      </div>
    );
  }

  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {signals.map((s, i) => {
        const accent = s.severity === "bad" ? "var(--red)" : "var(--rust)";
        return (
          <li
            key={`${s.kind}:${i}`}
            style={{
              background: "var(--card-bg)",
              border: `1px solid ${accent}`,
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12,
              color: "var(--moss)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 3,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: accent,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: accent,
                  fontFamily: "var(--font-display)",
                  fontSize: 10.5,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                {s.title}
              </span>
            </div>
            {s.detail}
          </li>
        );
      })}
    </ul>
  );
}
