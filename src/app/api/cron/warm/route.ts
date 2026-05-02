import { NextRequest, NextResponse } from "next/server";
import { OWNERS } from "@/lib/owners";

// Vercel cron-triggered cache warming. Hits the three main API routes so
// the in-memory caches + edge `s-maxage` cache stay populated, meaning real
// users almost never see a cold-build wait.
//
// Vercel signs cron requests with the project's `CRON_SECRET` env var via
// the `Authorization: Bearer <secret>` header — verify it before doing work
// so this endpoint can't be abused as a public refresh trigger that hammers
// HubSpot.
//
// Schedule: see vercel.json. Runs every 14 min so it stays just inside the
// 15-min in-memory TTL and the 14-min edge `s-maxage`.

// Per-region ownerIds for `/api/onboarding`. The other two routes
// (`/api/attention`, `/api/pay-migration`) cache a single global scope and
// filter client-side, so they don't need region warms.
function ownerIdsForRegion(region: "DK" | "SE" | "IT"): string {
  return [...OWNERS.filter((o) => o.region === region).map((o) => o.id)]
    .sort()
    .join(",");
}

// Optional: a comma-separated list of "VIP" company IDs to keep their detail
// payload warm. Pulled from env so we can change the list without redeploying.
// Empty / unset → skip the per-company warm step entirely.
function companyWarmIds(): string[] {
  const raw = process.env.WARM_COMPANY_IDS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s));
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const targets: string[] = [
    "/api/onboarding?refresh=true",
    "/api/attention?refresh=true",
    "/api/pay-migration?refresh=true",
    "/api/meeting-prep?refresh=true",
    // Per-region onboarding + meeting-prep scopes — the only routes whose
    // cache key includes ownerIds. Filter switches in CS happen often enough
    // that paying the first-cold cost there is the most visible source of
    // "still slow".
    `/api/onboarding?refresh=true&ownerIds=${ownerIdsForRegion("DK")}`,
    `/api/onboarding?refresh=true&ownerIds=${ownerIdsForRegion("SE")}`,
    `/api/onboarding?refresh=true&ownerIds=${ownerIdsForRegion("IT")}`,
    `/api/meeting-prep?refresh=true&ownerIds=${ownerIdsForRegion("DK")}`,
    `/api/meeting-prep?refresh=true&ownerIds=${ownerIdsForRegion("SE")}`,
    `/api/meeting-prep?refresh=true&ownerIds=${ownerIdsForRegion("IT")}`,
    // VIP company detail payloads — env-driven so we can rotate the list.
    ...companyWarmIds().map((id) => `/api/companies/${id}`),
  ];

  const t0 = performance.now();
  const results = await Promise.all(
    targets.map(async (path) => {
      const t = performance.now();
      try {
        // Use refresh=true so we rebuild — the new payload then populates
        // both the in-memory cache and (via the response Cache-Control on
        // subsequent cold reads) the edge cache.
        const res = await fetch(`${origin}${path}`, {
          headers: { "User-Agent": "vercel-cron-warm" },
          cache: "no-store",
        });
        return { path, status: res.status, ms: Math.round(performance.now() - t) };
      } catch (err) {
        return {
          path,
          status: 0,
          ms: Math.round(performance.now() - t),
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const totalMs = Math.round(performance.now() - t0);
  return NextResponse.json({ ok: true, totalMs, results });
}
