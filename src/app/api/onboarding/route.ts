import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { buildOnboardingPayload } from "@/lib/onboarding";
import { Cache } from "@/lib/cache";
import { OWNERS, REGIONS } from "@/lib/owners";
import type { OnboardingResponse } from "@/lib/types";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";

export const runtime = "edge";

const onboardingCache = new Cache<OnboardingResponse>(15 * 60 * 1000);

// Every ownerIds scope the filter pills can produce: one per person plus one
// per region grouping. Used to pre-warm the per-scope cache keys right after
// the unfiltered payload builds, so filter switches hit warm cache instead
// of a 1.5-2.5s rebuild.
// Regions first: they're the most common filter switch, and each region
// build also being warm makes the person switches inside it feel instant.
const FILTER_SCOPES: string[][] = [
  ...REGIONS.map((r) =>
    OWNERS.filter((o) => o.region === r.key).map((o) => o.id)
  ),
  ...OWNERS.map((o) => [o.id]),
];

function scopeCacheKey(ownerIds: string[]): string {
  return `onboarding:${[...ownerIds].sort().join(",")}`;
}

let warmInFlight = false;

// Two builds at a time: full concurrency (10 builds) would trip HubSpot's
// search-endpoint rate limit and slow everything down via 429 backoff, while
// fully sequential takes ~20s to cover all scopes.
async function warmFilterScopes(): Promise<void> {
  if (warmInFlight) return;
  warmInFlight = true;
  try {
    const queue = [...FILTER_SCOPES];
    const worker = async () => {
      for (;;) {
        const ownerIds = queue.shift();
        if (!ownerIds) return;
        const key = scopeCacheKey(ownerIds);
        if (onboardingCache.get(key)) continue;
        try {
          await onboardingCache.getOrBuild(key, async () => {
            const payload = await buildOnboardingPayload({ ownerIds });
            return { ...payload, updatedAt: new Date().toISOString() };
          });
        } catch {
          // Best-effort warming — the scope will build on demand instead.
        }
      }
    };
    await Promise.all([worker(), worker()]);
  } finally {
    warmInFlight = false;
  }
}

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const ownerIdsParam = request.nextUrl.searchParams.get("ownerIds") || "";
  const ownerIds = ownerIdsParam
    ? ownerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const cacheKey = ownerIds ? `onboarding:${[...ownerIds].sort().join(",")}` : "onboarding:all";
  const spans = createSpans();

  // Edge cache TTL — slightly under the in-memory 15min so the cron has a
  // window to warm the CDN before the edge expires. `stale-while-revalidate`
  // means a stale response can be served while a fresh one is fetched in
  // the background, so a user's request is never blocked on a cold build
  // once the cache is warm even once.
  const cacheControl = refresh
    ? "private, no-cache, no-store, max-age=0, must-revalidate"
    : "public, s-maxage=840, stale-while-revalidate=60";

  if (!refresh) {
    const cached = onboardingCache.get(cacheKey);
    if (cached) {
      spans.push({ label: "cache.hit", ms: 0 });
      logSpans("onboarding", spans);
      return NextResponse.json(cached, {
        headers: {
          "Server-Timing": serverTimingHeader(spans),
          "Cache-Control": cacheControl,
        },
      });
    }
  }

  try {
    const response = await withTiming(spans, "build", () =>
      onboardingCache.getOrBuild(cacheKey, async () => {
        const payload = await buildOnboardingPayload({ ownerIds, spans });
        return { ...payload, updatedAt: new Date().toISOString() };
      })
    );
    logSpans("onboarding", spans);
    // After serving the unfiltered payload, warm every filter scope in the
    // background so subsequent filter switches are cache hits.
    if (!ownerIds) {
      after(() => warmFilterScopes());
    }
    return NextResponse.json(response, {
      headers: {
        "Server-Timing": serverTimingHeader(spans),
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load onboarding data" },
      { status: 500 }
    );
  }
}
