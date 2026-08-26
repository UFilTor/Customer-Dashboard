"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MeetingPrepDeal,
  MeetingPrepMeetingEntry,
  MeetingPrepResponse,
  OnboardingHistoryEntry,
} from "@/lib/types";
import { effectiveCountries, effectiveOwnerIds, type GlobalFilter } from "@/lib/owners";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-fetch";
import { reportFreshness } from "@/lib/freshness";
import { MeetingPrepView } from "./MeetingPrepView";

interface Props {
  filter: GlobalFilter;
  filterLabel: string | null;
  onSelectCompany?: (companyId: string) => void;
}

function filterKey(filter: GlobalFilter): string {
  const ids = effectiveOwnerIds(filter);
  if (!ids) return "all";
  return [...ids].sort().join(",");
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextNWorkDayKeys(start: Date, n: number): string[] {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const keys: string[] = [];
  if (cursor.getDay() !== 0 && cursor.getDay() !== 6) keys.push(dayKey(cursor));
  while (keys.length < n) {
    cursor.setDate(cursor.getDate() + 1);
    const wd = cursor.getDay();
    if (wd !== 0 && wd !== 6) keys.push(dayKey(cursor));
  }
  return keys;
}

export function MeetingPrepContainer({ filter, filterLabel, onSelectCompany }: Props) {
  const [data, setData] = useState<MeetingPrepResponse | null>(null);

  // Report payload build time for the TopBar freshness label.
  useEffect(() => {
    reportFreshness("meeting_prep", data?.generatedAt);
  }, [data]);
  const [dataVersion, setDataVersion] = useState(0);
  // Bumped only on explicit user-initiated refresh. The lazy history fetch
  // includes this in its deps and passes ?refresh=true while it lags
  // last-applied, so the in-memory edge cache on /api/meeting-prep/history
  // gets busted in lockstep with the bulk endpoint.
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isFirstLoading, setIsFirstLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = filterKey(filter);

  const [fetchedDays, setFetchedDays] = useState<Set<string>>(
    () => new Set(nextNWorkDayKeys(new Date(), 5))
  );
  const [fetchingDays, setFetchingDays] = useState<Set<string>>(new Set());

  // Adjust-state-during-render: reset per-day fetch tracking when the filter
  // key changes (see AGENTS.md "Strict react-hooks lint").
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setFetchedDays(new Set(nextNWorkDayKeys(new Date(), 5)));
    setFetchingDays(new Set());
  }

  const dataRef = useRef<MeetingPrepResponse | null>(null);
  useEffect(() => {
    dataRef.current = data;
  });

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
        const url = `/api/meeting-prep${params.toString() ? `?${params.toString()}` : ""}`;
        const res = await apiFetch(url);
        if (!res.ok) {
          setError(friendlyErrorMessage(null, res.status));
          return;
        }
        const json: MeetingPrepResponse = await res.json();
        setData(json);
        setDataVersion((v) => v + 1);
        if (refresh) setRefreshNonce((v) => v + 1);
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
  }, [fetchData]);

  useEffect(() => {
    function onRefresh() {
      fetchData(true);
    }
    window.addEventListener("ud-refresh-dashboard", onRefresh);
    return () => window.removeEventListener("ud-refresh-dashboard", onRefresh);
  }, [fetchData]);

  const fetchDay = useCallback(
    async (dateKey: string) => {
      if (fetchingDays.has(dateKey)) return;
      setFetchingDays((prev) => {
        const next = new Set(prev);
        next.add(dateKey);
        return next;
      });
      try {
        const params = new URLSearchParams({ date: dateKey });
        if (key !== "all") params.set("ownerIds", key);
        const res = await apiFetch(`/api/meeting-prep/day?${params.toString()}`);
        if (!res.ok) throw new Error(`Day unavailable (${res.status})`);
        const json: { meetings: MeetingPrepMeetingEntry[] } = await res.json();
        setData((prev) => {
          if (!prev) return prev;
          const dropOldOnDay = prev.meetings.filter(
            (m) => dayKey(new Date(m.meeting.startsAt)) !== dateKey
          );
          return {
            ...prev,
            meetings: [...dropOldOnDay, ...json.meetings].sort((a, b) =>
              a.meeting.startsAt.localeCompare(b.meeting.startsAt)
            ),
          };
        });
        setFetchedDays((prev) => {
          const next = new Set(prev);
          next.add(dateKey);
          return next;
        });
      } catch {
        // Surfaced via the button staying in its un-fetched state.
      } finally {
        setFetchingDays((prev) => {
          const next = new Set(prev);
          next.delete(dateKey);
          return next;
        });
      }
    },
    [key, fetchingDays]
  );

  const historyDealIdsKey = useMemo(() => {
    if (!data) return "";
    const ids = new Set<string>();
    for (const m of data.meetings) {
      const id = m.deal.dealId;
      if (id && !id.startsWith("external-")) ids.add(id);
    }
    return Array.from(ids).sort().join(",");
  }, [data]);

  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!historyDealIdsKey) return;

    setHistoryLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ dealIds: historyDealIdsKey });
        if (refreshNonce > 0) params.set("refresh", "true");
        const res = await fetch(`/api/meeting-prep/history?${params.toString()}`);
        if (!res.ok) return;
        const json: Record<string, OnboardingHistoryEntry[]> = await res.json();
        if (cancelled) return;
        setData((prev) => {
          if (!prev) return prev;
          const mergeFor = (dealId: string, current: OnboardingHistoryEntry[]) => {
            const extra = json[dealId];
            if (!extra || extra.length === 0) return current;
            const seen = new Set(current.map((e) => e.id));
            const fresh = extra.filter((e) => !seen.has(e.id));
            if (fresh.length === 0) return current;
            return [...current, ...fresh].sort((a, b) =>
              b.occurredAt.localeCompare(a.occurredAt)
            );
          };
          return {
            ...prev,
            meetings: prev.meetings.map((entry) => {
              const merged = mergeFor(entry.deal.dealId, entry.deal.history);
              return merged === entry.deal.history
                ? entry
                : { ...entry, deal: { ...entry.deal, history: merged } };
            }),
          };
        });
      } catch {
        /* ignore — partial data is fine */
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyDealIdsKey, dataVersion, refreshNonce]);

  const filtered = useMemo<{
    meetings: MeetingPrepMeetingEntry[];
  }>(() => {
    if (!data) return { meetings: [] };
    const ids = effectiveOwnerIds(filter);
    // A territory owner covers accounts by country, not by ownership, so the
    // owner set is null for them and this country test does the narrowing.
    const countries = effectiveCountries(filter);
    const matches = (d: MeetingPrepDeal) => {
      if (countries) return d.country ? countries.has(d.country) : false;
      return ids ? (d.ownerId ? ids.has(d.ownerId) : false) : true;
    };
    return {
      meetings: data.meetings.filter((entry) => matches(entry.deal)),
    };
  }, [data, filter]);

  if (isFirstLoading && !data) {
    return (
      <div
        className="animate-pulse page-gutter"
        style={{
          background: "var(--beige-new)",
          minHeight: "calc(100vh - 120px)",
          paddingTop: 32,
          paddingBottom: 32,
        }}
      >
        <div className="page-max">
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
      <MeetingPrepView
        // Null for a territory filter: see the prop's note in MeetingPrepView.
        dealsTotal={effectiveCountries(filter) ? null : (data?.dealsTotal ?? 0)}
        lifecycleDealsTotal={data?.lifecycleDealsTotal ?? 0}
        retentionDealsTotal={data?.retentionDealsTotal ?? 0}
        meetings={filtered.meetings}
        filterLabel={filterLabel}
        fetchedDays={fetchedDays}
        fetchingDays={fetchingDays}
        onFetchDay={fetchDay}
        historyLoading={historyLoading}
        onSelectCompany={onSelectCompany}
      />
    </div>
  );
}
