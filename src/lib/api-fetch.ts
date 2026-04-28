"use client";

/**
 * Tiny client-side fetch wrapper. Pass an `AbortSignal` to make the request
 * cancellable (Cmd+K typing fast). On non-OK responses returns the response
 * to the caller so it can decide how to handle the status.
 */
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  return res;
}

/**
 * Maps a fetch error / response status to a CS-team-friendly message. Used
 * by the dashboard error states so users know whether to retry, wait, or
 * refresh — instead of a generic "Could not load data".
 */
export function friendlyErrorMessage(err: unknown, status?: number): string {
  if (status === 429) {
    return "HubSpot is rate-limiting us right now. Wait a few seconds and retry.";
  }
  if (status === 401 || status === 403) {
    return "Your session expired. Refresh the page to log in again.";
  }
  if (status && status >= 500) {
    return "HubSpot is slow or down. Retry in a moment.";
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return "Couldn't reach the server. Check your connection and retry.";
  }
  if (err instanceof Error && err.name === "AbortError") {
    return "Request was cancelled.";
  }
  return "Something went wrong loading this. Retry?";
}
