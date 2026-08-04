// Client-side plumbing for the TopBar "Updated Xm ago" freshness label.
//
// Containers own their payloads; the TopBar lives in page-client. Rather
// than threading generatedAt through props, containers report it via a
// window custom event (mirrors the established ud-filter-pill-state
// pattern). A module-level map keeps the latest value per dashboard so the
// TopBar can seed its state even if a container dispatched before the
// TopBar listener attached.

export const FRESHNESS_EVENT = "ud-payload-freshness";

export interface FreshnessDetail {
  dashboard: string;
  generatedAt: string;
}

const latest = new Map<string, string>();

// Called from containers (and page-client for Status) whenever a payload
// lands. No-op when generatedAt is absent (stale cache from before the
// field shipped) so the TopBar simply renders nothing.
export function reportFreshness(
  dashboard: string,
  generatedAt: string | undefined | null
): void {
  if (!generatedAt || typeof window === "undefined") return;
  latest.set(dashboard, generatedAt);
  window.dispatchEvent(
    new CustomEvent<FreshnessDetail>(FRESHNESS_EVENT, {
      detail: { dashboard, generatedAt },
    })
  );
}

export function getFreshnessSnapshot(): Record<string, string> {
  return Object.fromEntries(latest);
}

// Relative age label. Coarse on purpose: the label refreshes once a minute.
export function formatFreshness(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}
