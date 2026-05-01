import { NextRequest, NextResponse } from "next/server";
import { buildRetentionPayload } from "@/lib/retention";
import { Cache } from "@/lib/cache";
import type { RetentionResponse } from "@/lib/types";

const retentionCache = new Cache<RetentionResponse>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const ownerIdsParam = request.nextUrl.searchParams.get("ownerIds") || "";
  const ownerIds = ownerIdsParam
    ? ownerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const cacheKey = ownerIds
    ? `retention:${[...ownerIds].sort().join(",")}`
    : "retention:all";

  const cacheControl = refresh
    ? "private, no-cache, no-store, max-age=0, must-revalidate"
    : "public, s-maxage=840, stale-while-revalidate=60";

  if (!refresh) {
    const cached = retentionCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { "Cache-Control": cacheControl } });
    }
  }

  try {
    const response = await retentionCache.getOrBuild(cacheKey, async () => {
      const payload = await buildRetentionPayload({ ownerIds });
      return { ...payload, updatedAt: new Date().toISOString() };
    });
    return NextResponse.json(response, { headers: { "Cache-Control": cacheControl } });
  } catch {
    return NextResponse.json(
      { error: "Could not load retention data" },
      { status: 500 }
    );
  }
}
