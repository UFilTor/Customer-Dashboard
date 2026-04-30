import { NextRequest, NextResponse } from "next/server";
import { buildSearchPayload } from "@/lib/search-payload";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";
import type { GlobalFilter } from "@/lib/owners";
import type { SearchSpec } from "@/lib/types";

// Edge runtime — same rationale as /api/attention. Anthropic SDK + HubSpot
// fetch calls are both edge-safe. The in-memory cache in search-payload.ts
// is per-edge-instance, which is fine because each query is distinct anyway
// (the cache mostly serves to dedupe two concurrent identical requests).
export const runtime = "edge";

interface SearchBody {
  query?: string;
  filter?: GlobalFilter;
  priorSpec?: SearchSpec | null;
}

export async function POST(request: NextRequest) {
  const spans = createSpans();
  let body: SearchBody;
  try {
    body = (await request.json()) as SearchBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json(
      { error: "Query is required." },
      { status: 400 }
    );
  }
  // Default to "all" if no filter sent — the orchestrator will surface a
  // helpful error if the user said "mine" with no person filter set.
  const filter: GlobalFilter = body.filter ?? { kind: "all" };
  const priorSpec = body.priorSpec ?? null;

  try {
    const payload = await withTiming(spans, "search", () =>
      buildSearchPayload(query, filter, priorSpec)
    );
    logSpans("search", spans);
    // Search responses must not be edge-cached — the URL is the same for every
    // POST hit, but the body varies per query. Keep `private, no-cache` so a
    // shared edge cache never serves the wrong user's results.
    return NextResponse.json(payload, {
      headers: {
        "Server-Timing": serverTimingHeader(spans),
        "Cache-Control": "private, no-cache, no-store, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error(
      "[/api/search] failed:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Search failed. Try again." },
      { status: 500 }
    );
  }
}
