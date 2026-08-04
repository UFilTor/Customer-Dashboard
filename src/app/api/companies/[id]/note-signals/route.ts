import { NextRequest, NextResponse } from "next/server";
import { getCompanyDetail } from "@/lib/hubspot";
import { classifyNotes, noteFlagsToSignals } from "@/lib/notes-classifier";
import { Cache } from "@/lib/cache";
import type { WatchOutSignal } from "@/lib/types";

// Node runtime so the cron warm and user requests share one cache.

// Route-level cache on top of the classifier's own (companyId + latest
// engagement) cache: this one also skips the HubSpot detail fetch.
const signalCache = new Cache<WatchOutSignal[]>(60 * 60 * 1000, 128);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cacheHeaders = {
    "Cache-Control": "s-maxage=3300, stale-while-revalidate=300",
  };

  const cached = signalCache.get(id);
  if (cached) {
    return NextResponse.json({ signals: cached }, { headers: cacheHeaders });
  }

  try {
    const signals = await signalCache.getOrBuild(id, async () => {
      const detail = await getCompanyDetail(id);
      if (!detail.company || Object.keys(detail.company).length === 0) return [];
      const flags = await classifyNotes(id, detail.engagements);
      return noteFlagsToSignals(flags);
    });
    return NextResponse.json({ signals }, { headers: cacheHeaders });
  } catch {
    return NextResponse.json({ error: "Could not load note signals" }, { status: 500 });
  }
}
