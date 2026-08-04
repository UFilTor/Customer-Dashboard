"use client";

import type { SinceLastTouch as SinceLastTouchData } from "@/lib/types";

// Compact "what moved while nobody was looking" block. Rule-based feed from
// src/lib/since-last-touch.ts; rendered in Meeting Prep briefs + CompanyDetail.

function fmtChangeDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function touchLabel(days: number | null): string {
  if (days == null) return "Since last touch";
  if (days === 0) return "Since last touch · today";
  return `Since last touch · ${days} day${days === 1 ? "" : "s"}`;
}

export function SinceLastTouchBlock({ data }: { data: SinceLastTouchData | null }) {
  if (!data) return null;

  return (
    <div>
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          margin: "0 0 6px",
          paddingBottom: 5,
          borderBottom: "1px solid var(--beige-gray)",
          color: "var(--moss)",
        }}
      >
        {touchLabel(data.daysSinceTouch)}
      </h3>
      {data.changes.length === 0 ? (
        <div style={{ opacity: 0.5, fontSize: 12, fontStyle: "italic", color: "var(--moss)" }}>
          Nothing changed since then.
        </div>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {data.changes.map((c) => (
            <li
              key={c.field}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                fontSize: 12.5,
                color: "var(--moss)",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  opacity: 0.55,
                  whiteSpace: "nowrap",
                }}
              >
                {c.label}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {c.from != null ? (
                  <>
                    <span style={{ opacity: 0.65 }}>{c.from}</span>
                    <span style={{ opacity: 0.45 }}> → </span>
                    <strong>{c.to}</strong>
                  </>
                ) : (
                  <>
                    <span style={{ opacity: 0.65 }}>changed to </span>
                    <strong>{c.to}</strong>
                  </>
                )}
              </span>
              <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>
                {fmtChangeDate(c.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
