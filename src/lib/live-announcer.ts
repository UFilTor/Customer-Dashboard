// Shared aria-live announcer. Filter changes, loading states, and refresh
// outcomes were all silent to screen readers (0 aria-live regions measured
// anywhere in the app). Mirrors the pub-sub style already used by
// src/lib/freshness.ts: a custom window event any component can dispatch
// into, with one <LiveRegion /> (mounted once in page-client.tsx) rendering
// the message into a visually-hidden aria-live="polite" node.

export const LIVE_ANNOUNCE_EVENT = "ud-live-announce";

export function announce(message: string): void {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent(LIVE_ANNOUNCE_EVENT, { detail: message }));
}
