"use client";

import type { PortfolioStage, WatchOutSignal } from "@/lib/types";
import { signalStyle, calmCopy } from "@/lib/signal-display";

// Shared "Watch out for" renderer used by Meeting prep + Onboarding briefs.
// All visual decisions (severity palette, calm copy per stage) come from
// signal-display.ts so this component can stay pure layout: a vertical list
// with one bordered or filled card per signal. Mirrors the Portfolio
// SignalPill so both dashboards read as one system.
export function WatchOutFor({
  signals,
  stage,
}: {
  signals: WatchOutSignal[];
  stage?: PortfolioStage;
}) {
  if (signals.length === 0) {
    const calm = stage ? calmCopy(stage, "sentence") : "Nothing flagged.";
    return (
      <div style={{ opacity: 0.6, fontSize: 12, fontStyle: "italic" }}>
        {calm}
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
        const tokens = signalStyle(s.severity);
        return (
          <li
            key={`${s.kind}:${i}`}
            style={{
              background: s.severity === "bad" ? tokens.bg : "var(--card-bg)",
              border: `1px solid ${tokens.border}`,
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 12,
              color: s.severity === "bad" ? tokens.fg : "var(--moss)",
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
                  background: tokens.titleFg,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: tokens.titleFg,
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
