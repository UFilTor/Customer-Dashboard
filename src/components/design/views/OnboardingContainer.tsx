"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OnboardingDeal,
  OnboardingResponse,
} from "@/lib/types";
import { effectiveOwnerIds, type GlobalFilter } from "@/lib/owners";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-fetch";
import { OnboardingView } from "./OnboardingView";

interface Props {
  filter: GlobalFilter;
  filterLabel: string | null;
  onSelectDeal: (deal: OnboardingDeal) => void;
}

// Stable string key for the active filter — used as the useEffect dep so we
// only refetch when the actual scope changes, not on object-identity churn.
function filterKey(filter: GlobalFilter): string {
  const ids = effectiveOwnerIds(filter);
  if (!ids) return "all";
  return [...ids].sort().join(",");
}

export function OnboardingContainer({ filter, filterLabel, onSelectDeal }: Props) {
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [isFirstLoading, setIsFirstLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = filterKey(filter);

  const dataRef = useRef<OnboardingResponse | null>(null);
  dataRef.current = data;

  const inFlightRef = useRef(false);
  const fetchData = useCallback(
    async (refresh = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (dataRef.current === null) setIsFirstLoading(true);
      else setIsRevalidating(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (refresh) params.set("refresh", "true");
        if (key !== "all") params.set("ownerIds", key);
        const url = `/api/onboarding${params.toString() ? `?${params.toString()}` : ""}`;
        const res = await apiFetch(url);
        if (!res.ok) {
          setError(friendlyErrorMessage(null, res.status));
          return;
        }
        const json: OnboardingResponse = await res.json();
        setData(json);
      } catch (err) {
        setError(friendlyErrorMessage(err));
      } finally {
        setIsFirstLoading(false);
        setIsRevalidating(false);
        inFlightRef.current = false;
      }
    },
    [key]
  );

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Global "R" refresh — page-client dispatches when the user presses R while
  // this dashboard is mounted.
  useEffect(() => {
    function onRefresh() {
      fetchData(true);
    }
    window.addEventListener("ud-refresh-dashboard", onRefresh);
    return () => window.removeEventListener("ud-refresh-dashboard", onRefresh);
  }, [fetchData]);

  // Server already restricts by ownerIds, but keep a client guard for momentary
  // mismatches between cached "all" and a person filter while a refetch resolves.
  const filtered = useMemo<OnboardingDeal[]>(() => {
    if (!data) return [];
    const ids = effectiveOwnerIds(filter);
    return ids
      ? data.deals.filter((d) => (d.ownerId ? ids.has(d.ownerId) : false))
      : data.deals;
  }, [data, filter]);

  if (isFirstLoading && !data) {
    return (
      <div
        className="animate-pulse"
        style={{
          background: "var(--beige-new)",
          minHeight: "calc(100vh - 120px)",
          padding: "32px 28px",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ height: 200, background: "var(--hairline)", borderRadius: 20, marginBottom: 28 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 32 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ height: 96, background: "var(--hairline)", borderRadius: 14 }} />
            ))}
          </div>
          <div style={{ height: 320, background: "var(--hairline)", borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ padding: 60, textAlign: "center", background: "var(--beige-new)" }}>
        <p style={{ color: "var(--rust)", marginBottom: 12 }}>{error}</p>
        <button
          onClick={() => fetchData(true)}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            background: "var(--moss)",
            color: "var(--text-on-moss)",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={isRevalidating ? "is-revalidating" : undefined}>
      <OnboardingView
        deals={filtered}
        filterLabel={filterLabel}
        onSelect={onSelectDeal}
      />
    </div>
  );
}
