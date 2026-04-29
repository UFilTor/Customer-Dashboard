import { NextRequest, NextResponse } from "next/server";
import { buildAttentionPayload, getCachedAttention } from "@/lib/attention-payload";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";

// Edge runtime — ~50ms cold start vs Node's 500-1500ms. The in-memory cache
// inside `attention-payload.ts` is per-edge-instance; the 14-min cron and
// `s-maxage=840` keep cross-instance warmth.
export const runtime = "edge";

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const spans = createSpans();
  const cacheControl = refresh
    ? "private, no-cache, no-store, max-age=0, must-revalidate"
    : "public, s-maxage=840, stale-while-revalidate=60";

  if (!refresh) {
    const cached = getCachedAttention();
    if (cached) {
      spans.push({ label: "cache.hit", ms: 0 });
      logSpans("attention", spans);
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
      buildAttentionPayload({ refresh })
    );
    logSpans("attention", spans);
    return NextResponse.json(response, {
      headers: {
        "Server-Timing": serverTimingHeader(spans),
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load attention data" },
      { status: 500 }
    );
  }
}
