"use client";

import { Children, ReactNode, useEffect, useState, type CSSProperties } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function useCountUp(end: number, duration = 600): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const to = Number(end) || 0;
    // If target is 0 the initial state already covers it; skipping the rAF loop
    // also avoids a redundant setState that the react-hooks lint flags.
    if (to === 0) return;
    let raf: number;
    let start: number | null = null;
    const tick = (t: number) => {
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);
  return value;
}

export function CountUpInt({ value, duration }: { value: number; duration?: number }) {
  const v = useCountUp(value, duration);
  return <>{Math.round(v).toLocaleString()}</>;
}

export function CountUpPct({ value, decimals = 1, duration, suffix = "%" }: {
  value: number; decimals?: number; duration?: number; suffix?: string;
}) {
  const v = useCountUp(value, duration);
  return <>{v.toFixed(decimals)}{suffix}</>;
}

export function CountUpEur({ value, duration }: { value: number; duration?: number }) {
  const v = useCountUp(value, duration);
  if (value >= 1_000_000) return <>€{(v / 1_000_000).toFixed(1)}M</>;
  if (value >= 1_000) return <>€{Math.round(v / 1_000)}K</>;
  return <>€{Math.round(v)}</>;
}

interface AnimBarProps {
  pct: number;
  color?: string;
  height?: number;
  bg?: string;
  radius?: number;
  delay?: number;
}

// Animated bar fill — width transitions from 0 to pct on mount and on change.
export function AnimBar({ pct, color = "var(--moss)", height = 7, bg = "var(--hairline)", radius = 4, delay = 0 }: AnimBarProps) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.min(100, Math.max(0, pct))), 30 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);
  return (
    <div style={{ height, borderRadius: radius, background: bg, overflow: "hidden" }}>
      <div
        style={{
          width: `${w}%`,
          height: "100%",
          background: color,
          borderRadius: radius,
          transition: `width 700ms ${EASE}`,
        }}
      />
    </div>
  );
}

// Stagger wrapper — children fade/slide in one after another.
export function Stagger({
  children,
  delay = 70,
  initial = 120,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  initial?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={style}>
      {Children.map(children, (child, i) => {
        if (!child) return null;
        const d = initial + i * delay;
        return (
          <div style={{ animation: `staggerIn 360ms ${EASE} ${d}ms both` }}>
            {child}
          </div>
        );
      })}
    </div>
  );
}
