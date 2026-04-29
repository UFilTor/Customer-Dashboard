"use client";

import { useRef, useMemo, useEffect } from "react";

// Returns onMouseEnter / onMouseLeave handlers that fire `onPrefetch` after
// the cursor has dwelled `delayMs` over the element. Cancels on leave so
// drag-throughs don't kick off prefetches we'll never use.
export function useHoverPrefetch(onPrefetch: () => void, delayMs = 120) {
  const callbackRef = useRef(onPrefetch);
  // Mirror the latest callback into the ref via an effect (no deps) so
  // handlers stay stable but always read the freshest closure. Per the
  // project's react-hooks/refs rule we never mutate refs during render.
  useEffect(() => {
    callbackRef.current = onPrefetch;
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useMemo(
    () => ({
      onMouseEnter: () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          callbackRef.current();
          timerRef.current = null;
        }, delayMs);
      },
      onMouseLeave: () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      },
    }),
    [delayMs]
  );
}
