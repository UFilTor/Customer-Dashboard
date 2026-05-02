"use client";

import type { ReactNode } from "react";

// Shared empty / error state. Replaces three ad-hoc renderers (centered rust
// paragraph + bare moss button, "no meetings" beige dashed box, etc.) with a
// single composable that uses the brand's editorial italic + Inter caption
// voice. The action slot is optional so the same component works for "all
// clear" empties (no action needed) and recoverable errors (retry button).

interface EditorialEmptyProps {
  // The headline italic — short, sentence-cased, no exclamation marks.
  // E.g. "Nothing flagged today." or "Could not load attention rows."
  headline: string;
  // Optional small caption underneath. Use for diagnosis / context.
  caption?: ReactNode;
  // Optional action slot — render a ghost-moss button or a link.
  action?: ReactNode;
  // Visual padding tier. "comfortable" for full-page empties, "compact" for
  // inline empties (e.g. inside a card).
  size?: "comfortable" | "compact";
  // Tone — neutral by default; "error" tints the headline rust to signal
  // that something went wrong without breaking the editorial voice.
  tone?: "neutral" | "error";
}

export function EditorialEmpty({
  headline,
  caption,
  action,
  size = "comfortable",
  tone = "neutral",
}: EditorialEmptyProps) {
  const padding = size === "comfortable" ? "48px 32px" : "20px 16px";
  const headlineColor = tone === "error" ? "var(--rust)" : "var(--moss)";

  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      style={{
        padding,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-editorial)",
          fontStyle: "italic",
          fontSize: size === "comfortable" ? 18 : 14,
          fontWeight: 400,
          color: headlineColor,
          margin: 0,
          lineHeight: 1.35,
          maxWidth: 480,
        }}
      >
        {headline}
      </p>
      {caption && (
        <div
          style={{
            fontSize: 12.5,
            color: "var(--green-100)",
            margin: 0,
            maxWidth: 420,
            lineHeight: 1.45,
          }}
        >
          {caption}
        </div>
      )}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}
