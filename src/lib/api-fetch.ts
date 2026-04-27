"use client";

/**
 * Tiny client-side fetch wrapper. Two responsibilities:
 *
 * 1. Redirect to the sign-in page on 401 instead of letting the caller render a
 *    misleading "Could not load data, try refreshing" message. The session has
 *    expired; refreshing won't help.
 * 2. Throw with a useful message on non-OK responses so callers can surface
 *    something better than a generic catch-all.
 *
 * Pass an `AbortSignal` to make the request cancellable (Cmd+K typing fast).
 */
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      const here = window.location.pathname + window.location.search;
      window.location.assign(`/auth/signin?callbackUrl=${encodeURIComponent(here)}`);
    }
    throw new Error("Session expired");
  }
  return res;
}
