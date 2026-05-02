import { NextRequest, NextResponse } from "next/server";
import { buildOnboardingPayload } from "@/lib/onboarding";
import { Cache } from "@/lib/cache";
import type { OnboardingMeetingEntry } from "@/lib/types";

// Per-(filter,day) cache so revisiting a manually-fetched day doesn't refetch.
// 15-minute TTL matches the bulk and history caches.
const dayCache = new Cache<OnboardingMeetingEntry[]>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const dateParam = request.nextUrl.searchParams.get("date") || "";
  const ownerIdsParam = request.nextUrl.searchParams.get("ownerIds") || "";
  const ownerIds = ownerIdsParam
    ? ownerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  // Expect YYYY-MM-DD. Build start-of-day → start-of-next-day in local time
  // so the bounds line up with the day strip the user clicked on.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam.trim());
  if (!m) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    dayStart.getFullYear() !== year ||
    dayStart.getMonth() !== month - 1 ||
    dayStart.getDate() !== day
  ) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const ownerKey = ownerIds ? [...ownerIds].sort().join(",") : "all";
  const cacheKey = `onboarding-day:${ownerKey}:${dateParam}`;

  if (!refresh) {
    const cached = dayCache.get(cacheKey);
    if (cached) return NextResponse.json({ meetings: cached });
  }

  try {
    const payload = await buildOnboardingPayload({
      ownerIds,
      meetingFromIso: dayStart.toISOString(),
      meetingToIso: dayEnd.toISOString(),
    });
    dayCache.set(cacheKey, payload.meetings);
    return NextResponse.json({ meetings: payload.meetings });
  } catch {
    return NextResponse.json(
      { error: "Could not load day meetings" },
      { status: 500 }
    );
  }
}
