import { NextRequest, NextResponse } from "next/server";
import { buildMeetingPrepResponse } from "@/lib/meeting-prep";
import { Cache } from "@/lib/cache";
import type { MeetingPrepResponse } from "@/lib/types";

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
    const response = await meetingPrepCache.getOrBuild(cacheKey, () =>
      buildMeetingPrepResponse({ ownerIds })
    );
    return NextResponse.json(response, { headers: { "Cache-Control": cacheControl } });
  } catch {
    return NextResponse.json(
      { error: "Could not load meeting prep data" },
      { status: 500 }
    );
  }
}
