import { NextRequest, NextResponse } from "next/server";
import { buildMeetingPrepResponse } from "@/lib/meeting-prep";
import { Cache } from "@/lib/cache";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";
import type { MeetingPrepResponse } from "@/lib/types";

// Edge runtime — primitives are all `fetch`-based (HubSpot v3/v4 + the
// Cache helper holds an in-memory Map). Edge cuts ~500-1500ms off cold
// starts and matches the rest of the dashboard's main API routes.
export const runtime = "edge";

const meetingPrepCache = new Cache<MeetingPrepResponse>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const ownerIdsParam = request.nextUrl.searchParams.get("ownerIds") || "";
  const ownerIds = ownerIdsParam
    ? ownerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const cacheKey = ownerIds
    ? `meeting-prep:${[...ownerIds].sort().join(",")}`
    : "meeting-prep:all";

  // Edge cache TTL — slightly under the in-memory 15min so the cron has a
  // window to warm the CDN before the edge expires.
  const cacheControl = refresh
    ? "private, no-cache, no-store, max-age=0, must-revalidate"
    : "public, s-maxage=840, stale-while-revalidate=60";

  if (!refresh) {
    const cached = meetingPrepCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { "Cache-Control": cacheControl } });
    }
  }

  try {
    const spans = createSpans();
    const response = await withTiming(spans, "build", () =>
      meetingPrepCache.getOrBuild(cacheKey, () =>
        buildMeetingPrepResponse({ ownerIds, spans })
      )
    );
    logSpans("meeting-prep", spans);
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": cacheControl,
        "Server-Timing": serverTimingHeader(spans),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load meeting prep data" },
      { status: 500 }
    );
  }
}
