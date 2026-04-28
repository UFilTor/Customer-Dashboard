import { NextRequest, NextResponse } from "next/server";
import { buildOnboardingPayload } from "@/lib/onboarding";
import { Cache } from "@/lib/cache";
import type { OnboardingResponse } from "@/lib/types";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";

const onboardingCache = new Cache<OnboardingResponse>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const ownerIdsParam = request.nextUrl.searchParams.get("ownerIds") || "";
  const ownerIds = ownerIdsParam
    ? ownerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const cacheKey = ownerIds ? `onboarding:${[...ownerIds].sort().join(",")}` : "onboarding:all";
  const spans = createSpans();

  if (!refresh) {
    const cached = onboardingCache.get(cacheKey);
    if (cached) {
      spans.push({ label: "cache.hit", ms: 0 });
      logSpans("onboarding", spans);
      return NextResponse.json(cached, {
        headers: { "Server-Timing": serverTimingHeader(spans) },
      });
    }
  }

  try {
    const response = await withTiming(spans, "build", () =>
      onboardingCache.getOrBuild(cacheKey, async () => {
        const payload = await buildOnboardingPayload({ ownerIds, spans });
        return { ...payload, updatedAt: new Date().toISOString() };
      })
    );
    logSpans("onboarding", spans);
    return NextResponse.json(response, {
      headers: { "Server-Timing": serverTimingHeader(spans) },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load onboarding data" },
      { status: 500 }
    );
  }
}
