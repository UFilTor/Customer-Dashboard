"use client";

import type { ReactNode } from "react";

// Single KPI tile shared by Status / Meeting prep / Pay migration. Earlier
// versions had three different renderers (moss-bg + citrus label on Status,
// cream-bg + green-100 label on Meeting prep, top-border accent on Pay) which
// trained the user that "the morning summary is a different surface in every
// dashboard". One renderer, one shape, three views. The brand pulls toward
// cream-on-cream — the dark moss "accent" variant earns its weight by
// dropping the citrus accents the original "drenched moss" tile had.

export type KpiTone = "neutral" | "good" | "warn" | "bad" | "accent";

interface KpiProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: KpiTone;
}

export function Kpi({ label, value, sub, tone = "neutral" }: KpiProps) {
  const isAccent = tone === "accent";
  const valueInk = (() => {
    if (tone === "bad") return "var(--rust)";
    if (tone === "warn") return "var(--status-warn-bold, var(--rust))";
    if (tone === "good") return "var(--status-good-bold, var(--moss))";
    if (isAccent) return "var(--text-on-moss)";
    return "var(--moss)";
  })();
  const bg = isAccent ? "var(--moss)" : "var(--card-bg)";
  const labelColor = isAccent ? "var(--inverse-text)" : "var(--green-100)";
  const subColor = isAccent ? "var(--inverse-text)" : "var(--green-100)";

  return (
    <div
      style={{
        background: bg,
        border: isAccent ? "none" : "1px solid var(--hairline)",
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.06em",
          color: labelColor,
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 32,
          lineHeight: 1,
          color: valueInk,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: 12,
            color: subColor,
            marginTop: 6,
            fontStyle: "italic",
            fontFamily: "var(--font-editorial)",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
