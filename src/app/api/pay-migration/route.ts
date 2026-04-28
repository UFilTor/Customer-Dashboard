import { NextRequest, NextResponse } from "next/server";
import { fetchPayMigrationData } from "@/lib/pay-migration";
import { Cache } from "@/lib/cache";
import type { PayMigrationData } from "@/lib/types";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";

const payCache = new Cache<PayMigrationData>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const spans = createSpans();

  if (!refresh) {
    const cached = payCache.get("pay-migration");
    if (cached) {
      spans.push({ label: "cache.hit", ms: 0 });
      logSpans("pay-migration", spans);
      return NextResponse.json(cached, {
        headers: { "Server-Timing": serverTimingHeader(spans) },
      });
    }
  }

  try {
    const data = await withTiming(spans, "build", () =>
      payCache.getOrBuild("pay-migration", () => fetchPayMigrationData(spans))
    );
    logSpans("pay-migration", spans);
    return NextResponse.json(data, {
      headers: { "Server-Timing": serverTimingHeader(spans) },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load Pay Migration data" },
      { status: 500 }
    );
  }
}
