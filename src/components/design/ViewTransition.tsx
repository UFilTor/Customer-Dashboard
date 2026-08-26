"use client";

import { ReactNode, useState } from "react";
import type { DashboardKey } from "./VariantPicker";

// Wraps the main content and crossfades on dashboard change. First render is a
// no-op so initial paint stays snappy.
//
// This used to also slide directionally on a *variant* change, following the
// segmented control's left-to-right order. Variants only ever existed for the
// Status dashboard (Daily briefing / Split view); with Status gone there is
// nothing to slide between, so only the crossfade remains.
interface Props {
  dashboard: DashboardKey;
  children: ReactNode;
}

export function ViewTransition({ dashboard, children }: Props) {
  // Track the previous render's identity in state and adjust it during
  // render - React's recommended pattern for "react to a prop change without
  // useEffect".
  const [prev, setPrev] = useState<DashboardKey | null>(null);

  const mode = prev && prev !== dashboard ? "view-fade" : "";

  // Convergent - only fires when the input actually changed.
  if (prev !== dashboard) setPrev(dashboard);

  return (
    <div key={dashboard} className={mode}>
      {children}
    </div>
  );
}
