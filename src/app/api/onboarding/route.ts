import { NextRequest, NextResponse } from "next/server";
import { buildOnboardingPayload } from "@/lib/onboarding";
import { Cache } from "@/lib/cache";
import type { OnboardingResponse } from "@/lib/types";

const onboardingCache = new Cache<OnboardingResponse>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const ownerIdsParam = request.nextUrl.searchParams.get("ownerIds") || "";
  const ownerIds = ownerIdsParam
    ? ownerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  // Cache key includes the owner filter so each filter view gets its own
  // 15-minute window — switching back to "All" doesn't need to re-fetch.
  const cacheKey = ownerIds ? `onboarding:${[...ownerIds].sort().join(",")}` : "onboarding:all";

  if (!refresh) {
    const cached = onboardingCache.get(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

  try {
    const payload = await buildOnboardingPayload({ ownerIds });
    const response: OnboardingResponse = {
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    onboardingCache.set(cacheKey, response);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Could not load onboarding data" },
      { status: 500 }
    );
  }
}
