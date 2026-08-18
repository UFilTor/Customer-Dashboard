"use client";

import { memo, useMemo, useState } from "react";
import { fmtEur, fmtEurFull } from "@/lib/format-design";
import { synthesizeMonthlyTrend, smoothTrend } from "@/lib/synth-trend";

type Range = "3M" | "6M" | "12M" | "All";

interface VolumeChartProps {
  company: Record<string, string>;
}

// Memoized so the chart doesn't recompute when its parent re-renders for an
// unrelated reason (keystroke, focus change in the brief). Re-renders only
// when the company-properties bag's identity changes.
export const VolumeChart = memo(function VolumeChartImpl({ company }: VolumeChartProps) {
  const [range, setRange] = useState<Range>("12M");

  const v12 = parseFloat(company.understory_booking_volume_12m || "0") || 0;
  const v6 = parseFloat(company.understory_booking_volume_6m || "0") || 0;
  const v3 = parseFloat(company.understory_booking_volume_3m || "0") || 0;
  const v2 = parseFloat(company.understory_booking_volume_2m || "0") || 0;
  const v1 = parseFloat(company.understory_booking_volume_1m || "0") || 0;
  const allTime = parseFloat(company.understory_booking_volume_all_time || "0") || 0;

  const monthly = useMemo(
    () => smoothTrend(synthesizeMonthlyTrend({ volume12m: v12, volume6m: v6, volume3m: v3, volume2m: v2, volume1m: v1 })),
    [v12, v6, v3, v2, v1]
  );

  const seriesByRange = useMemo(() => {
    const last3 = monthly.slice(-3);
    const last6 = monthly.slice(-6);
    return { "3M": last3, "6M": last6, "12M": monthly, All: monthly } as Record<Range, number[]>;
  }, [monthly]);

  const totalByRange: Record<Range, number> = {
    "3M": v3,
    "6M": v6,
    "12M": v12,
    All: allTime || v12,
  };

  // Recent change %: compare the selected period's run rate to the prior
  // period of the same length. Only 3M/6M have a prior window we can derive
  // from the snapshot fields (12M would need a 24m snapshot we don't have).
  const priorByRange: Partial<Record<Range, number>> = {
    "3M": Math.max(0, v6 - v3),
    "6M": Math.max(0, v12 - v6),
  };
  const currentByRange: Partial<Record<Range, number>> = { "3M": v3, "6M": v6 };
  const priorPeriod = priorByRange[range];
  const currentPeriod = currentByRange[range];
  const recentChange =
    priorPeriod && priorPeriod > 0 && currentPeriod !== undefined
      ? Math.round(((currentPeriod - priorPeriod) / priorPeriod) * 100)
      : 0;

  const data = seriesByRange[range];

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        padding: 22,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 14,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--green-100)",
              marginBottom: 8,
            }}
          >
            Booking volume
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 40,
                lineHeight: 1,
                color: "var(--moss)",
              }}
            >
              {fmtEur(totalByRange[range])}
            </span>
            {recentChange !== 0 && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: recentChange >= 0 ? "var(--status-good-bold)" : "var(--rust)",
                }}
              >
                {recentChange >= 0 ? "↑" : "↓"} {Math.abs(recentChange)}%
              </span>
            )}
            <span
              style={{
                fontSize: 12,
                color: "var(--green-100)",
                fontStyle: "italic",
                fontFamily: "var(--font-editorial)",
              }}
            >
              {range === "All" ? "all time" : `last ${range.toLowerCase()}`}
            </span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            background: "var(--beige-new)",
            padding: 3,
            borderRadius: 10,
          }}
        >
          {(["3M", "6M", "12M", "All"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                padding: "5px 12px",
                fontSize: 11.5,
                fontWeight: 600,
                borderRadius: 7,
                color: r === range ? "var(--moss)" : "var(--green-100)",
                background: r === range ? "var(--light-grey)" : "transparent",
                boxShadow: r === range ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                cursor: "pointer",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <Chart data={data} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 10,
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--hairline)",
        }}
      >
        {[
          { label: "1M", value: v1 },
          { label: "3M", value: v3 },
          { label: "6M", value: v6 },
          { label: "12M", value: v12 },
        ].map((v) => (
          <div key={v.label}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                textTransform: "uppercase",
                fontSize: 10,
                color: "var(--green-100)",
                letterSpacing: "0.06em",
                fontWeight: 700,
              }}
            >
              {v.label}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginTop: 3,
                color: "var(--moss)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtEurFull(v.value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

function Chart({ data, width = 560, height = 120 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length === 0 || data.every((v) => v === 0)) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--green-100)",
          fontSize: 13,
          fontStyle: "italic",
          fontFamily: "var(--font-editorial)",
        }}
      >
        No volume yet
      </div>
    );
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => [i * step, height - ((v - min) / range) * (height - 20) - 10]);
  const line = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
    >
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--moss)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--moss)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#vg)" />
      <path d={line} fill="none" stroke="var(--moss)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={last[0]} cy={last[1]} r={4} fill="var(--citrus)" stroke="var(--moss)" strokeWidth={1.5} />}
    </svg>
  );
}
