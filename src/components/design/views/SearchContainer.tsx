"use client";

import { useCallback, useRef, useState } from "react";
import { SearchView } from "./SearchView";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-fetch";
import type { GlobalFilter } from "@/lib/owners";
import type {
  SearchResponse,
  SearchResult,
  SearchTurn,
} from "@/lib/types";

// Owns the refinement chain. Each Enter pushes a new turn; the prior turn's
// `spec` is sent as `priorSpec` so the LLM treats it as a refinement instead
// of a fresh query. Reset clears the chain. Rewind drops back to a turn and
// re-renders its results.

interface SearchContainerProps {
  filter: GlobalFilter;
  onSelectCompany: (companyId: string) => void;
}

export function SearchContainer({
  filter,
  onSelectCompany,
}: SearchContainerProps) {
  const [query, setQuery] = useState("");
  const [chain, setChain] = useState<SearchTurn[]>([]);
  const [latestResults, setLatestResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"parse" | "execute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Drop submits while another search is in flight. Without this, repeated
  // Enter presses kick off duplicate Anthropic calls and the chain ends up
  // with whichever response races back last.
  const inFlightRef = useRef(false);

  // Each turn fires once on Enter. The body is small (a few fields); the
  // server caches by query+filter+priorSpec for 15 min so identical resubmits
  // are essentially free.
  const onSubmit = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setLoadingPhase("parse");
    setError(null);
    // The server doesn't actually report two phases — we synthesise the
    // transition client-side for UX (parse is bounded ~1.5s, then we flip).
    const phaseTimer = setTimeout(() => setLoadingPhase("execute"), 1200);
    const priorSpec =
      chain.length > 0 ? chain[chain.length - 1].spec : null;
    try {
      const res = await apiFetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, filter, priorSpec }),
      });
      if (!res.ok) {
        setError(friendlyErrorMessage(null, res.status));
        return;
      }
      const json: SearchResponse = await res.json();
      if (json.error) {
        setError(json.error);
        return;
      }
      const turn: SearchTurn = {
        query: q,
        spec: json.parsed,
        results: json.results,
      };
      setChain((prev) => [...prev, turn]);
      setLatestResults(json.results);
      setQuery("");
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      clearTimeout(phaseTimer);
      setLoading(false);
      setLoadingPhase(null);
      inFlightRef.current = false;
    }
  }, [query, filter, chain]);

  const onReset = useCallback(() => {
    setChain([]);
    setLatestResults([]);
    setQuery("");
    setError(null);
  }, []);

  const onRewindTo = useCallback((turnIdx: number) => {
    setChain((prev) => {
      const truncated = prev.slice(0, turnIdx + 1);
      const lastTurn = truncated[truncated.length - 1];
      setLatestResults(lastTurn?.results ?? []);
      return truncated;
    });
    setQuery("");
    setError(null);
  }, []);

  return (
    <SearchView
      query={query}
      setQuery={setQuery}
      onSubmit={onSubmit}
      onReset={onReset}
      onRewindTo={onRewindTo}
      loading={loading}
      loadingPhase={loadingPhase}
      results={latestResults}
      chain={chain}
      error={error}
      onSelectCompany={onSelectCompany}
    />
  );
}
