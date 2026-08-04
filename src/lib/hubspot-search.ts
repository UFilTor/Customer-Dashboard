import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";

// Generalised retry helper for HubSpot's `/crm/v3/objects/{type}/search`.
// HubSpot intermittently 429s or 5xxs individual page requests; the previous
// pattern of `if (!res.ok) break` silently truncated datasets and the partial
// result got cached for 15 minutes. We retry transient failures with a small
// exponential backoff and throw on terminal failure so callers / caches reject
// the bad result.
//
// IMPORTANT: every body must include a `sorts` clause. Without it, HubSpot's
// search-API pagination cursor can stop early and yield a truncated dataset.
// Convention: `sorts: [{ propertyName: "createdate", direction: "DESCENDING" }]`.

export interface SearchPage<T = unknown> {
  results: T[];
  nextAfter: string | undefined;
  // HubSpot's server-side match count for the whole filter, not just this
  // page. Lets callers get pool sizes from a single limit:1 request instead
  // of paginating the full result set.
  total: number;
}

const RETRIES = 3;
const BACKOFF_MS = 400;

export async function searchObjectsPage<T = unknown>(
  objectType: string,
  body: Record<string, unknown>
): Promise<SearchPage<T>> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(
        `${HUBSPOT_API}/crm/v3/objects/${objectType}/search`,
        {
          method: "POST",
          headers: hubspotHeaders(),
          body: JSON.stringify(body),
        }
      );
    } catch (e) {
      lastErr = e;
      if (attempt === RETRIES) break;
      await new Promise((r) => setTimeout(r, BACKOFF_MS * (attempt + 1)));
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      return {
        results: (data.results || []) as T[],
        nextAfter: data.paging?.next?.after,
        total: typeof data.total === "number" ? data.total : 0,
      };
    }
    // Retry on rate-limits and server errors. 4xx other than 429 are terminal.
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`HubSpot ${objectType} search ${res.status}`);
      if (attempt === RETRIES) break;
      await new Promise((r) => setTimeout(r, BACKOFF_MS * (attempt + 1)));
      continue;
    }
    throw new Error(`HubSpot ${objectType} search ${res.status}`);
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`HubSpot ${objectType} search failed`);
}
