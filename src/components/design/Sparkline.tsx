"use client";

import { useEffect, useRef } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  tone?: "good" | "bad" | "neutral";
}

// Sparkline that draws itself in on mount via stroke-dashoffset animation.
export function Sparkline({ data, width = 64, height = 20, tone }: SparklineProps) {
  const ref = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let len = 0;
    try {
      len = el.getTotalLength();
    } catch {
      return;
    }
    el.style.transition = "none";
    el.style.strokeDasharray = String(len);
    el.style.strokeDashoffset = String(len);
    void el.getBoundingClientRect();
    el.style.transition = "stroke-dashoffset 720ms cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.strokeDashoffset = "0";
  }, [data]);

  if (!data || data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / Math.max(data.length - 1, 1);
  const pts = data
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${height - ((v - min) / range) * height}`)
    .join(" ");

  const first = data[0];
  const last = data[data.length - 1];
  const auto = last >= first ? "good" : "bad";
  const t = tone === "neutral" ? "neutral" : tone || auto;
  const stroke =
    t === "good" ? "var(--status-good-bold)" :
    t === "bad" ? "var(--rust)" :
    "var(--moss)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <path
        ref={ref}
        d={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
