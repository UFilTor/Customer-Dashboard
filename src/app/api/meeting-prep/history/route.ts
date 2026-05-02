import { NextRequest, NextResponse } from "next/server";
import { fetchMeetingPrepHistoryForDeals } from "@/lib/meeting-prep";
import { Cache } from "@/lib/cache";
import type { OnboardingHistoryEntry } from "@/lib/types";

export const runtime = "edge";

const historyCache = new Cache<OnboardingHistoryEntry[]>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const dealIdsParam = request.nextUrl.searchParams.get("dealIds") || "";
  const dealIds = dealIdsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (dealIds.length === 0) return NextResponse.json({});

  const cached: Record<string, OnboardingHistoryEntry[]> = {};
  const misses: string[] = [];
  if (!refresh) {
    for (const id of dealIds) {
      const hit = historyCache.get(id);
      if (hit) cached[id] = hit;
      else misses.push(id);
    }
  } else {
    misses.push(...dealIds);
  }

  if (misses.length === 0) return NextResponse.json(cached);

  try {
    const fetched = await fetchMeetingPrepHistoryForDeals(misses);
    for (const id of misses) {
      const entries = fetched.get(id) ?? [];
      historyCache.set(id, entries);
      cached[id] = entries;
    }
    return NextResponse.json(cached);
  } catch {
    return NextResponse.json({ error: "Could not load deal history" }, { status: 500 });
  }
}
