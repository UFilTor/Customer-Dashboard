import { NextRequest, NextResponse } from "next/server";
import { buildMeetingPrepPayload } from "@/lib/meeting-prep";
import { Cache } from "@/lib/cache";
import type { MeetingPrepMeetingEntry } from "@/lib/types";

const dayCache = new Cache<MeetingPrepMeetingEntry[]>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const dateParam = request.nextUrl.searchParams.get("date") || "";
  const ownerIdsParam = request.nextUrl.searchParams.get("ownerIds") || "";
  const ownerIds = ownerIdsParam
    ? ownerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam.trim());
  if (!m) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  const dayStart = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const ownerKey = ownerIds ? [...ownerIds].sort().join(",") : "all";
  const cacheKey = `meeting-prep-day:${ownerKey}:${dateParam}`;

  if (!refresh) {
    const cached = dayCache.get(cacheKey);
    if (cached) return NextResponse.json({ meetings: cached });
  }

  try {
    const payload = await buildMeetingPrepPayload({
      ownerIds,
      meetingFromIso: dayStart.toISOString(),
      meetingToIso: dayEnd.toISOString(),
    });
    dayCache.set(cacheKey, payload.meetings);
    return NextResponse.json({ meetings: payload.meetings });
  } catch {
    return NextResponse.json({ error: "Could not load day meetings" }, { status: 500 });
  }
}
