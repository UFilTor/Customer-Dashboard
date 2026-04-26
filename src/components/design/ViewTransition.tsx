"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import type { Variant, DashboardKey } from "./VariantPicker";

const VARIANT_ORDER: Variant[] = ["briefing", "split", "kanban"];

type AnimMode = "none" | "fade" | "slide-from-right" | "slide-from-left";

function classFor(mode: AnimMode): string {
  switch (mode) {
    case "fade": return "view-fade";
    case "slide-from-right": return "view-slide-from-right";
    case "slide-from-left": return "view-slide-from-left";
    default: return "";
  }
}

interface Props {
  dashboard: DashboardKey;
  variant: Variant;
  children: ReactNode;
}

// Wraps the main content. On dashboard change → opacity crossfade. On variant
// change within a dashboard → directional slide that follows the segmented
// control's left-to-right order. First render is a no-op so initial paint
// stays snappy.
export function ViewTransition({ dashboard, variant, children }: Props) {
  const prevRef = useRef<{ dashboard: DashboardKey; variant: Variant } | null>(null);
  const [mode, setMode] = useState<AnimMode>("none");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { dashboard, variant };
    if (!prev) return;

    let next: AnimMode = "none";
    if (prev.dashboard !== dashboard) {
      next = "fade";
    } else if (prev.variant !== variant) {
      const a = VARIANT_ORDER.indexOf(prev.variant);
      const b = VARIANT_ORDER.indexOf(variant);
      if (a !== -1 && b !== -1) {
        next = b > a ? "slide-from-right" : "slide-from-left";
      } else {
        next = "fade";
      }
    } else {
      return;
    }
    setMode(next);
    setTick((t) => t + 1);
  }, [dashboard, variant]);

  return (
    <div key={tick} className={classFor(mode)}>
      {children}
    </div>
  );
}
