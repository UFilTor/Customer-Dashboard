// Hover-triggered prefetch helpers. The browser will cache the response
// (HTTP cache for same-origin GETs), so when the user clicks ~500ms later,
// the request resolves from cache instantly. Combined with a tiny dwell
// delay in `useHoverPrefetch`, this filters out drag-through noise without
// firing dozens of requests.

// In-flight URLs we've already kicked off. Reset after 30s so the same
// account can be prefetched again later (matches the browser's typical
// short-cache TTL for our `s-maxage=840` responses on a fresh tab).
const inflight = new Set<string>();
const COOL_DOWN_MS = 30_000;

function fire(url: string): void {
  if (inflight.has(url)) return;
  inflight.add(url);
  fetch(url, { credentials: "same-origin", cache: "default" })
    .catch(() => {
      // Swallow — this is purely an optimization. The real fetch on click
      // surfaces errors via apiFetch.
    })
    .finally(() => {
      setTimeout(() => inflight.delete(url), COOL_DOWN_MS);
    });
}

export function prefetchCompany(id: string): void {
  if (!/^\d+$/.test(id)) return;
  fire(`/api/companies/${id}`);
}

export function prefetchAttention(): void {
  fire("/api/attention");
}

// Triggers the bulk fetch AND warms the dynamic chunk so the click resolves
// with both code and data already in flight.
export function prefetchOnboarding(ownerIdsCsv?: string | null): void {
  const url =
    ownerIdsCsv && ownerIdsCsv !== "all"
      ? `/api/onboarding?ownerIds=${ownerIdsCsv}`
      : "/api/onboarding";
  fire(url);
  void import("@/components/design/views/OnboardingContainer");
}

export function prefetchPayMigration(): void {
  fire("/api/pay-migration");
  void import("@/components/design/views/PayMigrationContainer");
}

// Search has no bulk endpoint to prefetch (each query is a fresh POST), so we
// only warm the dynamic chunk so the click resolves with code already loaded.
export function prefetchSearch(): void {
  void import("@/components/design/views/SearchContainer");
}
