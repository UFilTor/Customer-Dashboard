"use client";

import { ReactNode, useState } from "react";
import type { Variant, DashboardKey } from "./VariantPicker";

const VARIANT_ORDER: Variant[] = ["briefing", "split"];

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
  // Track the previous render's identity in state and adjust it during
  // render — React's recommended pattern for "react to a prop change without
  // useEffect". Computes the animation mode in the same pass.
  const [prev, setPrev] = useState<{ dashboard: DashboardKey; variant: Variant } | null>(null);

  let mode: AnimMode = "none";
  if (prev) {
    if (prev.dashboard !== dashboard) {
      mode = "fade";
    } else if (prev.variant !== variant) {
      const a = VARIANT_ORDER.indexOf(prev.variant);
      const b = VARIANT_ORDER.indexOf(variant);
      mode = a !== -1 && b !== -1 ? (b > a ? "slide-from-right" : "slide-from-left") : "fade";
    }
  }

  // Convergent — only fires when the inputs actually changed.
  if (!prev || prev.dashboard !== dashboard || prev.variant !== variant) {
    setPrev({ dashboard, variant });
  }

  return (
    <div key={`${dashboard}/${variant}`} className={classFor(mode)}>
      {children}
    </div>
  );
}
