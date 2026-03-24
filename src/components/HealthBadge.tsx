"use client";

import { getHealthTrend, getHealthColor, getHealthLabel } from "@/lib/health-score";

interface Props {
  category: string;
  previousCategory?: string;
}

export default function HealthBadge({ category, previousCategory }: Props) {
  const { bg, text } = getHealthColor(category);
  const trend = getHealthTrend(category, previousCategory);
  const label = getHealthLabel(category);

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
      {trend && (
        <>
          <span className="text-[10px]">
            {trend.direction === "improving" ? "\u2191" : "\u2193"}
          </span>
          <span className="text-[10px] font-normal opacity-70">
            was {getHealthLabel(trend.previous)}
          </span>
        </>
      )}
    </span>
  );
}
