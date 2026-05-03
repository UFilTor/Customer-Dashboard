import { NextRequest, NextResponse } from "next/server";
import { buildPortfolioPayload, getCachedPortfolio } from "@/lib/portfolio";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";

// Edge runtime, same rationale as /api/attention. Per-edge-instance cache
// is warmed by the 14-min cron, with s-maxage=840 covering cross-instance.
export const runtime = "edge";

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const ownerIdsCsv = request.nextUrl.searchParams.get("ownerIds");
  const cacheKey = `portfolio:${ownerIdsCsv ?? "all"}`;
  const spans = createSpans();
  const cacheControl = refresh
    ? "private, no-cache, no-store, max-age=0, must-revalidate"
    : "public, s-maxage=840, stale-while-revalidate=60";

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
      buildPortfolioPayload(ownerIdsCsv, { refresh })
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
