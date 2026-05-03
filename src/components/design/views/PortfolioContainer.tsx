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

export function PortfolioContainer({ filter, onSelectCompany }: Props) {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [isFirstLoading, setIsFirstLoading] = useState(true);
  const [, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSignals, setSelectedSignals] = useState<PortfolioSignalKey[]>([]);
  const [sortKey, setSortKey] = useState<PortfolioSortKey>("urgency");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

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
    const dir = sortOpt.direction === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = extractSortKey(a, sortKey);
      const bv = extractSortKey(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [data, selectedSignals, sortKey]);

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
      if (next) setSortKey(next.key);
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
      setHasSavedDefault(true);
    }
  }, []);

  const totalsBySignal = data?.totalsBySignal ?? {
    overdue_invoices: 0, open_invoices: 0, no_future_events: 0, health_dropped: 0,
    stuck_in_step: 0, volume_declining: 0, wish_to_churn: 0, gone_quiet: 0,
  };

  if (error && !data) return <div style={{ padding: 24 }}>{error}</div>;
  if (isFirstLoading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!data) return null;

  return (
    <PortfolioView
      rows={filteredSortedRows}
      totalsBySignal={totalsBySignal}
      selectedSignals={selectedSignals}
      toggleSignal={(k) =>
        setSelectedSignals((prev) =>
          prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]
        )
      }
      clearSignals={() => setSelectedSignals([])}
      sortKey={sortKey}
      setSortKey={setSortKey}
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
