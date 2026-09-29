// The global TopBar is sticky, so anything else that sticks to the top of the
// page pins BELOW it: `top: var(--topbar-h)`. TopBar measures itself and
// publishes the height on :root; these helpers read it for JS that compares
// against the viewport top (IntersectionObserver sentinels, scroll tracking).

/** Current TopBar height in px (0 before TopBar has measured itself). */
export function topbarHeight(): number {
  if (typeof document === "undefined") return 0;
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h"));
  return Number.isFinite(v) ? v : 0;
}

/**
 * rootMargin for a sentinel observer that should fire when a sticky strip pins
 * under the TopBar rather than at the viewport top.
 */
export function belowTopbarRootMargin(): string {
  return `-${Math.round(topbarHeight())}px 0px 0px 0px`;
}
