"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OnboardingDeal,
  OnboardingHistoryEntry,
  OnboardingMeetingEntry,
  OnboardingResponse,
} from "@/lib/types";
import { effectiveOwnerIds, type GlobalFilter } from "@/lib/owners";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-fetch";
import { OnboardingView } from "./OnboardingView";
import type { OnboardingSubview } from "../VariantPicker";

interface Props {
  subview: OnboardingSubview;
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

// Local-date YYYY-MM-DD (don't toISOString — that flips across midnight UTC).
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Returns dayKeys for `start` (if it's a workday) plus the next workdays,
// totalling `n` workdays. Mirrors endOfNthWorkDay() on the server so the
// frontend can pre-populate the "fetched" set without a round-trip.
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

export function OnboardingContainer({
  subview,
  filter,
  filterLabel,
  onSelectDeal,
}: Props) {
  const [data, setData] = useState<OnboardingResponse | null>(null);
  const [isFirstLoading, setIsFirstLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = filterKey(filter);

  // Day keys we have meetings for. Seeded with the bulk endpoint's default
  // window (today + 4 forward workdays) so the strip doesn't show "fetch"
  // buttons on the days that are already loaded.
  const defaultFetchedKeys = useMemo(() => {
    const now = new Date();
    return nextNWorkDayKeys(now, 5);
  }, [key]); // recompute on filter switch — keeps Set fresh post-reset

  const [fetchedDays, setFetchedDays] = useState<Set<string>>(
    () => new Set(defaultFetchedKeys)
  );
  // Days currently in flight to /api/onboarding/day so the button can show a
  // loading state and we don't fire duplicate requests on rapid clicks.
  const [fetchingDays, setFetchingDays] = useState<Set<string>>(new Set());

  // Reset the fetched-day set whenever the filter changes — the per-filter
  // bulk fetch returns a fresh window, and previously manually-fetched days
  // belong to a different filter scope's cache key on the server.
  useEffect(() => {
    setFetchedDays(new Set(defaultFetchedKeys));
    setFetchingDays(new Set());
  }, [key, defaultFetchedKeys]);
  // We deliberately read from a ref so fetchData stays stable across data
  // updates — the effect below already keys on `key` for refetch triggers.
  const dataRef = useRef<OnboardingResponse | null>(null);
  dataRef.current = data;

  // Drop redundant refresh requests when one is already in flight (R-key spam,
  // tab focus + manual refresh racing).
  const inFlightRef = useRef(false);
  const fetchData = useCallback(async (refresh = false) => {
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
  }, [key]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Global "R" refresh — page.tsx dispatches when the user presses R while
  // this dashboard is mounted.
  useEffect(() => {
    function onRefresh() {
      fetchData(true);
    }
    window.addEventListener("ud-refresh-dashboard", onRefresh);
    return () => window.removeEventListener("ud-refresh-dashboard", onRefresh);
  }, [fetchData]);

  // Fetch a single day's meetings on-demand. Merges into data.meetings,
  // replacing any existing entries for that day so we don't duplicate.
  const fetchDay = useCallback(async (dateKey: string) => {
    if (fetchingDays.has(dateKey)) return;
    setFetchingDays((prev) => {
      const next = new Set(prev);
      next.add(dateKey);
      return next;
    });
    try {
      const params = new URLSearchParams({ date: dateKey });
      if (key !== "all") params.set("ownerIds", key);
      const res = await apiFetch(`/api/onboarding/day?${params.toString()}`);
      if (!res.ok) throw new Error(`Day unavailable (${res.status})`);
      const json: { meetings: OnboardingMeetingEntry[] } = await res.json();
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
      // Surfaced via the button staying in its un-fetched state — user can retry.
    } finally {
      setFetchingDays((prev) => {
        const next = new Set(prev);
        next.delete(dateKey);
        return next;
      });
    }
  }, [key, fetchingDays]);

  // Stable comma-joined string of deal IDs that need history. Memoised so the
  // history effect below only fires when the SET of deals changes, not when
  // we merge history back into `data` (which mutates the array identity).
  const historyDealIdsKey = useMemo(() => {
    if (!data) return "";
    const ids = new Set<string>();
    for (const m of data.meetings) {
      const id = m.deal.dealId;
      if (id && !id.startsWith("external-")) ids.add(id);
    }
    return Array.from(ids).sort().join(",");
  }, [data]);

  // Lazy history backfill — once the list is in, request calls + threaded
  // emails for every deal surfaced on the upcoming-meetings strip. Merges
  // into the cached payload so MeetingBriefCard rerenders with the full
  // timeline. Errors are swallowed silently — the brief still shows
  // meetings/notes, history just stays empty.
  useEffect(() => {
    if (!historyDealIdsKey) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/onboarding/history?dealIds=${historyDealIdsKey}`);
        if (!res.ok) return;
        const json: Record<string, OnboardingHistoryEntry[]> = await res.json();
        if (cancelled) return;
        setData((prev) => {
          if (!prev) return prev;
          const mergeFor = (dealId: string, current: OnboardingHistoryEntry[]) => {
            const extra = json[dealId];
            if (!extra || extra.length === 0) return current;
            // Dedup by entry.id — the effect can re-fire after a per-day
            // fetch, and re-merging against already-merged history would
            // otherwise duplicate thread:* keys.
            const seen = new Set(current.map((e) => e.id));
            const fresh = extra.filter((e) => !seen.has(e.id));
            if (fresh.length === 0) return current;
            return [...current, ...fresh].sort(
              (a, b) => b.occurredAt.localeCompare(a.occurredAt)
            );
          };
          return {
            ...prev,
            deals: prev.deals.map((d) => {
              const merged = mergeFor(d.dealId, d.history);
              return merged === d.history ? d : { ...d, history: merged };
            }),
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
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyDealIdsKey]);

  // The server already restricted by ownerIds, but we keep a client-side guard
  // for any deals/meetings that fall outside (e.g. cached "all" being viewed
  // through a person filter momentarily before the refetch resolves).
  const filtered = useMemo<{
    deals: OnboardingDeal[];
    meetings: OnboardingMeetingEntry[];
  }>(() => {
    if (!data) return { deals: [], meetings: [] };
    const ids = effectiveOwnerIds(filter);
    const matches = (d: OnboardingDeal) =>
      ids ? (d.ownerId ? ids.has(d.ownerId) : false) : true;
    return {
      deals: data.deals.filter(matches),
      meetings: data.meetings.filter((entry) => matches(entry.deal)),
    };
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
        subview={subview}
        deals={filtered.deals}
        meetings={filtered.meetings}
        filterLabel={filterLabel}
        onSelect={onSelectDeal}
        fetchedDays={fetchedDays}
        fetchingDays={fetchingDays}
        onFetchDay={fetchDay}
      />
    </div>
  );
}
