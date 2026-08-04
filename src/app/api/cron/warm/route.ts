import { NextRequest, NextResponse } from "next/server";
import { OWNERS } from "@/lib/owners";

// The pooled warm (24 targets at concurrency 4, plus the recap pass) can run
// 1-2 minutes. Without this, Vercel's default function timeout can cut the
// cron short and silently leave the later scopes cold.
export const maxDuration = 300;

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

// Per-region ownerIds for `/api/meeting-prep` and `/api/portfolio`. The other
// routes (`/api/attention`, `/api/pay-migration`) cache a single global scope
// and filter client-side, so they don't need region warms.
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
    "/api/attention?refresh=true",
    "/api/pay-migration?refresh=true",
    "/api/meeting-prep?refresh=true",
    // Per-region meeting-prep + portfolio scopes — the only routes whose
    // cache key includes ownerIds. Filter switches in CS happen often enough
    // that paying the first-cold cost there is the most visible source of
    // "still slow".
    `/api/meeting-prep?refresh=true&ownerIds=${ownerIdsForRegion("DK")}`,
    `/api/meeting-prep?refresh=true&ownerIds=${ownerIdsForRegion("SE")}`,
    `/api/meeting-prep?refresh=true&ownerIds=${ownerIdsForRegion("IT")}`,
    "/api/portfolio?refresh=true",
    `/api/portfolio?refresh=true&ownerIds=${ownerIdsForRegion("DK")}`,
    `/api/portfolio?refresh=true&ownerIds=${ownerIdsForRegion("SE")}`,
    `/api/portfolio?refresh=true&ownerIds=${ownerIdsForRegion("IT")}`,
    // Per-person scopes — filtering to a single CS owner is its own cache key,
    // and person filters were the last commonly-used scope still hitting cold
    // 5s+ builds. One warm per owner per route.
    ...OWNERS.flatMap((o) => [
      `/api/meeting-prep?refresh=true&ownerIds=${o.id}`,
      `/api/portfolio?refresh=true&ownerIds=${o.id}`,
    ]),
    // VIP company detail payloads — env-driven so we can rotate the list.
    ...companyWarmIds().map((id) => `/api/companies/${id}`),
  ];

  const t0 = performance.now();
  // Limited concurrency: each target fans out into many HubSpot calls, and
  // firing 20+ full builds at once trips HubSpot's burst rate limit (renders
  // as 500s that then get skipped for a whole warm cycle).
  const warmOne = async (path: string) => {
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
  };
  const results: Array<Awaited<ReturnType<typeof warmOne>>> = [];
  {
    const queue = [...targets];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (queue.length > 0) {
          const path = queue.shift();
          if (path) results.push(await warmOne(path));
        }
      })
    );
  }

  // Second pass: warm recaps for companies with meetings today/tomorrow.
  // Runs after the meeting-prep warm so we can read the freshly built payload
  // straight from the (now warm) endpoint. Capped at 15 companies; each recap
  // is one Haiku call, cached 60 min server-side.
  let recapResults: Array<{ path: string; status: number; ms: number }> = [];
  try {
    const res = await fetch(`${origin}/api/meeting-prep`, {
      headers: { "User-Agent": "vercel-cron-warm" },
      cache: "no-store",
    });
    if (res.ok) {
      const json: {
        meetings?: Array<{ meeting: { startsAt: string }; deal: { companyId: string | null } }>;
      } = await res.json();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 2);
      cutoff.setHours(0, 0, 0, 0);
      const companyIds = Array.from(
        new Set(
          (json.meetings || [])
            .filter((m) => new Date(m.meeting.startsAt) < cutoff)
            .map((m) => m.deal.companyId)
            .filter((id): id is string => !!id)
        )
      ).slice(0, 15);
      const warmPaths = companyIds.flatMap((id) => [
        `/api/companies/${id}/recap`,
        `/api/companies/${id}/note-signals`,
      ]);
      recapResults = await Promise.all(
        warmPaths.map(async (path) => {
          const t = performance.now();
          try {
            const r = await fetch(`${origin}${path}`, {
              headers: { "User-Agent": "vercel-cron-warm" },
              cache: "no-store",
            });
            return { path, status: r.status, ms: Math.round(performance.now() - t) };
          } catch {
            return { path, status: 0, ms: Math.round(performance.now() - t) };
          }
        })
      );
    }
  } catch {
    // Best-effort — recaps just stay cold until clicked.
  }

  const totalMs = Math.round(performance.now() - t0);
  return NextResponse.json({ ok: true, totalMs, results: [...results, ...recapResults] });
}
