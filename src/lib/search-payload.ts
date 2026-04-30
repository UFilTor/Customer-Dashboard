import { Cache } from "./cache";
import { searchDashboard } from "./search";
import type { GlobalFilter } from "./owners";
import type {
  SearchResponse,
  SearchSpec,
} from "./types";

// Cache + builder for search results. Mirrors `attention-payload.ts` so a
// future server-component prefetch (or just dedup of same-second duplicate
// requests on the same edge instance) hits a single shared module.
//
// Cache key normalises the query (lowercase + trim + collapse whitespace) and
// hashes the priorSpec so a refinement turn doesn't collide with a fresh
// turn. Same hash strategy as the one in cache.ts.

const TTL_MS = 15 * 60 * 1000;
const MAX_KEYS = 100;

const searchCache = new Cache<SearchResponse>(TTL_MS, MAX_KEYS);

function normaliseQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function filterScopeKey(filter: GlobalFilter): string {
  if (filter.kind === "all") return "all";
  if (filter.kind === "person") return `p:${filter.ownerId}`;
  return `r:${filter.region}`;
}

function priorSpecKey(priorSpec: SearchSpec | null): string {
  if (!priorSpec) return "";
  // A short stable key — we don't need cryptographic uniqueness, just enough
  // to distinguish refinement-of-X from refinement-of-Y in the cache window.
  return JSON.stringify(priorSpec).slice(0, 256);
}

export function buildSearchCacheKey(
  query: string,
  filter: GlobalFilter,
  priorSpec: SearchSpec | null
): string {
  return `q=${normaliseQuery(query)}|f=${filterScopeKey(filter)}|p=${priorSpecKey(priorSpec)}`;
}

export async function buildSearchPayload(
  query: string,
  filter: GlobalFilter,
  priorSpec: SearchSpec | null
): Promise<SearchResponse> {
  const cacheKey = buildSearchCacheKey(query, filter, priorSpec);
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  return searchCache.getOrBuild(cacheKey, async () => {
    const t0 = Date.now();
    const outcome = await searchDashboard(query, filter, priorSpec);
    const latencyMs = Date.now() - t0;
    return {
      results: outcome.results,
      parsed: outcome.parsed,
      latencyMs,
      error: outcome.error,
    };
  });
}
