import { NextRequest, NextResponse } from "next/server";
import { buildPortfolioPayload, getCachedPortfolio } from "@/lib/portfolio";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";

// Edge runtime, same rationale as /api/attention. Per-edge-instance cache
// is warmed by the 14-min cron, with s-maxage=840 covering cross-instance.
export const runtime = "edge";

// Per-IP rate limit on ?refresh=true. The cron handles routine warming;
// human refreshes should be infrequent. Without this, anyone past the
// Vercel password gate could hammer refresh and burn the HubSpot quota.
// Map persists per edge-instance; sufficient for the threat model (no
// distributed throttle needed for an internal tool).
const refreshHits = new Map<string, number>();
const REFRESH_WINDOW_MS = 60_000;

function shouldRateLimit(ip: string): boolean {
  const now = Date.now();
  const last = refreshHits.get(ip);
  if (last && now - last < REFRESH_WINDOW_MS) return true;
  refreshHits.set(ip, now);
  // Drop stale slots opportunistically so the map stays bounded.
  if (refreshHits.size > 256) {
    const cutoff = now - REFRESH_WINDOW_MS * 2;
    for (const [k, ts] of refreshHits) if (ts < cutoff) refreshHits.delete(k);
  }
  return false;
}

// Normalize the ownerIds CSV so callers can pass IDs in any order without
// fragmenting the cache. Frontend already sorts, but server-side sort closes
// the gap for direct callers / future features. Trailing junk (empty strings,
// whitespace) is stripped before keying.
function normalizeOwnerIdsCsv(raw: string | null): string | null {
  if (!raw) return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  return [...new Set(ids)].sort().join(",");
}

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const ownerIdsCsv = normalizeOwnerIdsCsv(
    request.nextUrl.searchParams.get("ownerIds")
  );
  const cacheKey = `portfolio:${ownerIdsCsv ?? "all"}`;
  const spans = createSpans();
  const cacheControl = refresh
    ? "private, no-cache, no-store, max-age=0, must-revalidate"
    : "public, s-maxage=840, stale-while-revalidate=60";

  if (refresh) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (shouldRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many refreshes. Try again in a minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  if (!refresh) {
    const cached = getCachedPortfolio(cacheKey);
    if (cached) {
      spans.push({ label: "cache.hit", ms: 0 });
      logSpans("portfolio", spans);
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
      buildPortfolioPayload(ownerIdsCsv, { refresh, spans })
    );
    logSpans("portfolio", spans);
    return NextResponse.json(response, {
      headers: {
        "Server-Timing": serverTimingHeader(spans),
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load portfolio data" },
      { status: 500 }
    );
  }
}
