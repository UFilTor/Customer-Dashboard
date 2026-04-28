import { NextRequest, NextResponse } from "next/server";

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
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const targets = [
    "/api/onboarding?refresh=true",
    "/api/attention?refresh=true",
    "/api/pay-migration?refresh=true",
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
