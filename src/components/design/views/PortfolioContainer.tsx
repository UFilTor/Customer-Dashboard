"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PortfolioResponse,
  PortfolioRow,
  PortfolioDefaults,
  PortfolioSignalKey,
  PortfolioSortKey,
} from "@/lib/types";
import { effectiveOwnerIds, type GlobalFilter, parseFilter, serializeFilter } from "@/lib/owners";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-fetch";
import { extractSortKey, getSortOptions } from "@/lib/portfolio";
import { PORTFOLIO_SIGNAL_ORDER } from "@/lib/signals";
import { PortfolioView } from "./PortfolioView";

interface Props {
  filter: GlobalFilter;
  filterLabel: string | null;
  // When false (typically when the global filter is a single-person filter),
  // the OWNER column hides because every row would show the same avatar.
  showAvatar?: boolean;
  onSelectCompany: (companyId: string) => void;
}

const DEFAULTS_KEY = "ud-v2-portfolio-default";

function filterKey(filter: GlobalFilter): string {
  const ids = effectiveOwnerIds(filter);
  if (!ids) return "all";
  return [...ids].sort().join(",");
}

function loadDefaults(): PortfolioDefaults | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const f = parseFilter(JSON.stringify(parsed.filter));
    if (!f) return null;
    if (!Array.isArray(parsed.signals)) return null;
    if (typeof parsed.sort !== "string") return null;
    return { filter: f, signals: parsed.signals as PortfolioSignalKey[], sort: parsed.sort as PortfolioSortKey };
  } catch {
    return null;
  }
}

function saveDefaults(d: PortfolioDefaults): void {
  localStorage.setItem(
    DEFAULTS_KEY,
    JSON.stringify({ filter: JSON.parse(serializeFilter(d.filter)), signals: d.signals, sort: d.sort })
  );
}

export function PortfolioContainer({ filter, showAvatar = true, onSelectCompany }: Props) {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [isFirstLoading, setIsFirstLoading] = useState(true);
  const [, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSignals, setSelectedSignals] = useState<PortfolioSignalKey[]>([]);
  const [sortKey, setSortKey] = useState<PortfolioSortKey>("urgency");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  // Click handler for sort selection. Re-clicking the active sort key flips
  // direction (asc↔desc); clicking a different key resets direction to that
  // option's natural default.
  const setSort = useCallback(
    (k: PortfolioSortKey) => {
      if (k === sortKey) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return;
      }
      const opt = getSortOptions(selectedSignals).find((o) => o.key === k);
      setSortKey(k);
      setSortDirection(opt?.direction ?? "desc");
    },
    [sortKey, selectedSignals]
  );

  const key = filterKey(filter);

  const dataRef = useRef<PortfolioResponse | null>(null);
  useEffect(() => { dataRef.current = data; });
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
        const url = `/api/portfolio${params.toString() ? `?${params.toString()}` : ""}`;
        const res = await apiFetch(url);
        if (!res.ok) {
          setError(friendlyErrorMessage(null, res.status));
          return;
        }
        const json: PortfolioResponse = await res.json();
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

  useEffect(() => {
    function onRefresh() { fetchData(true); }
    window.addEventListener("ud-refresh-dashboard", onRefresh);
    return () => window.removeEventListener("ud-refresh-dashboard", onRefresh);
  }, [fetchData]);

  const filteredSortedRows = useMemo<PortfolioRow[]>(() => {
    if (!data) return [];
    const filtered = selectedSignals.length === 0
      ? data.rows
      : data.rows.filter((r) =>
          r.signals.some((s) => {
            const k = mapKindToKey(s.kind, s.title);
            return selectedSignals.includes(k);
          })
        );

    const sortOpt = getSortOptions(selectedSignals).find((o) => o.key === sortKey);
    if (!sortOpt) return filtered;
    const dir = sortDirection === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = extractSortKey(a, sortKey);
      const bv = extractSortKey(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [data, selectedSignals, sortKey, sortDirection]);

  const stateRef = useRef({ rows: filteredSortedRows, focused: focusedRowIndex });
  useEffect(() => {
    stateRef.current = { rows: filteredSortedRows, focused: focusedRowIndex };
  });

  useEffect(() => {
    function onNav(e: Event) {
      const direction = (e as CustomEvent<"prev" | "next">).detail;
      const { rows, focused } = stateRef.current;
      if (rows.length === 0) return;
      const next = focused == null
        ? 0
        : direction === "next"
          ? Math.min(focused + 1, rows.length - 1)
          : Math.max(focused - 1, 0);
      setFocusedRowIndex(next);
    }
    function onOpen() {
      const { rows, focused } = stateRef.current;
      if (focused == null || !rows[focused]) return;
      onSelectCompany(rows[focused].id);
    }
    function onSignalToggle(e: Event) {
      const idx = (e as CustomEvent<number>).detail;
      const k = PORTFOLIO_SIGNAL_ORDER[idx];
      if (!k) return;
      setSelectedSignals((prev) =>
        prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]
      );
    }
    function onSignalClear() { setSelectedSignals([]); }
    function onSortCycle() {
      const opts = getSortOptions(selectedSignals);
      const idx = opts.findIndex((o) => o.key === sortKey);
      const next = opts[(idx + 1) % opts.length];
      if (next) {
        // Cycle key + reset direction to the new option's natural default.
        setSortKey(next.key);
        setSortDirection(next.direction);
      }
    }
    function onSaveDefaults() {
      saveDefaults({ filter, signals: selectedSignals, sort: sortKey });
    }

    window.addEventListener("ud-list-nav", onNav);
    window.addEventListener("ud-list-open", onOpen);
    window.addEventListener("ud-portfolio-signal-toggle", onSignalToggle);
    window.addEventListener("ud-portfolio-signal-clear", onSignalClear);
    window.addEventListener("ud-portfolio-sort-cycle", onSortCycle);
    window.addEventListener("ud-portfolio-save-defaults", onSaveDefaults);
    return () => {
      window.removeEventListener("ud-list-nav", onNav);
      window.removeEventListener("ud-list-open", onOpen);
      window.removeEventListener("ud-portfolio-signal-toggle", onSignalToggle);
      window.removeEventListener("ud-portfolio-signal-clear", onSignalClear);
      window.removeEventListener("ud-portfolio-sort-cycle", onSortCycle);
      window.removeEventListener("ud-portfolio-save-defaults", onSaveDefaults);
    };
  }, [selectedSignals, sortKey, filter, onSelectCompany]);

  const [hasSavedDefault, setHasSavedDefault] = useState(false);
  useEffect(() => {
    const d = loadDefaults();
    if (d) {
      setSelectedSignals(d.signals);
      setSortKey(d.sort);
      // Direction isn't persisted; restore the option's natural default.
      const opt = getSortOptions(d.signals).find((o) => o.key === d.sort);
      setSortDirection(opt?.direction ?? "desc");
      setHasSavedDefault(true);
    }
  }, []);

  const totalsBySignal = data?.totalsBySignal ?? {
    overdue_invoices: 0, open_invoices: 0, no_future_events: 0, health_dropped: 0,
    stuck_in_step: 0, volume_declining: 0, wish_to_churn: 0, gone_quiet: 0,
  };

  if (error && !data) return <div style={{ padding: 24 }}>{error}</div>;
  if (isFirstLoading) return <PortfolioSkeleton />;
  if (!data) return null;

  return (
    <PortfolioView
      rows={filteredSortedRows}
      totalsBySignal={totalsBySignal}
      showAvatar={showAvatar}
      selectedSignals={selectedSignals}
      toggleSignal={(k) =>
        setSelectedSignals((prev) =>
          prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]
        )
      }
      clearSignals={() => setSelectedSignals([])}
      sortKey={sortKey}
      sortDirection={sortDirection}
      setSortKey={setSort}
      focusedRowIndex={focusedRowIndex}
      onRowClick={(row) => onSelectCompany(row.id)}
      hasSavedDefault={hasSavedDefault}
      defaultsAreCurrent={isCurrentEqualToSaved(filter, selectedSignals, sortKey)}
      onSaveDefaults={() => {
        saveDefaults({ filter, signals: selectedSignals, sort: sortKey });
        setHasSavedDefault(true);
      }}
      onResetDefaults={() => {
        const d = loadDefaults();
        if (!d) return;
        setSelectedSignals(d.signals);
        setSortKey(d.sort);
        const opt = getSortOptions(d.signals).find((o) => o.key === d.sort);
        setSortDirection(opt?.direction ?? "desc");
      }}
    />
  );
}

function isCurrentEqualToSaved(
  filter: GlobalFilter,
  signals: PortfolioSignalKey[],
  sort: PortfolioSortKey
): boolean {
  const saved = loadDefaults();
  if (!saved) return false;
  if (serializeFilter(saved.filter) !== serializeFilter(filter)) return false;
  if (saved.sort !== sort) return false;
  if (saved.signals.length !== signals.length) return false;
  const a = [...saved.signals].sort();
  const b = [...signals].sort();
  return a.every((v, i) => v === b[i]);
}

function PortfolioSkeleton() {
  // Mirrors the live Portfolio shape: moss banner + toolbar pills + column
  // header + 8 placeholder rows. animate-pulse comes from Tailwind utilities
  // already in globals.css.
  return (
    <div style={{ background: "var(--page-bg)", minHeight: "calc(100vh - 120px)" }}>
      <div style={{ padding: "20px 28px 0" }}>
        <div
          className="animate-pulse"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            background: "var(--moss)",
            borderRadius: 18,
            height: 154,
            opacity: 0.85,
          }}
        />
      </div>
      <div className="animate-pulse" style={{ padding: "0 28px 60px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 10, padding: "12px 0" }}>
            <div style={{ height: 36, width: 180, background: "var(--hairline)", borderRadius: 10 }} />
            <div style={{ flex: 1 }} />
            <div style={{ height: 36, width: 180, background: "var(--hairline)", borderRadius: 10 }} />
          </div>
          <div
            style={{
              height: 36,
              background: "var(--card-bg)",
              border: "1px solid var(--hairline)",
              borderTopLeftRadius: 14,
              borderTopRightRadius: 14,
              marginBottom: 0,
            }}
          />
          <div
            style={{
              height: 32,
              background: "var(--card-bg)",
              borderLeft: "1px solid var(--hairline)",
              borderRight: "1px solid var(--hairline)",
              borderBottom: "1px solid var(--hairline-strong)",
            }}
          />
          <div
            style={{
              border: "1px solid var(--hairline)",
              borderTop: 0,
              borderBottomLeftRadius: 14,
              borderBottomRightRadius: 14,
              overflow: "hidden",
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "96px 1fr 280px 60px 80px 50px 44px",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 18px",
                  borderBottom: i === 7 ? "none" : "1px solid var(--hairline)",
                }}
              >
                <span style={{ height: 18, background: "var(--hairline)", borderRadius: 6 }} />
                <span style={{ height: 14, background: "var(--hairline)", borderRadius: 4, width: "70%" }} />
                <span style={{ height: 16, background: "var(--hairline)", borderRadius: 6, width: "55%" }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 28 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 50 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 30 }} />
                <span style={{ height: 22, width: 22, background: "var(--hairline)", borderRadius: "50%", justifySelf: "end" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function mapKindToKey(kind: string, title: string): PortfolioSignalKey {
  if (title === "Open invoice") return "open_invoices";
  switch (kind) {
    case "overdue_invoice":   return "overdue_invoices";
    case "wish_to_churn":     return "wish_to_churn";
    case "volume_declining":  return "volume_declining";
    case "no_future_events":  return "no_future_events";
    case "stuck_in_step":     return "stuck_in_step";
    case "health_dropped":    return "health_dropped";
    case "gone_quiet":        return "gone_quiet";
    default:                  return "gone_quiet";
  }
}
