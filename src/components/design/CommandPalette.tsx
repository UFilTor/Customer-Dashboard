"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { CompanySearchResult } from "@/lib/types";
import { getRecentCompanies } from "@/lib/recent-companies";
import { getBookmarks } from "@/lib/bookmarks";

export type PaletteAction = "refresh" | "open-company-in-hubspot" | "open-deal-in-hubspot";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onPickCompany: (company: CompanySearchResult) => void;
  onAction: (action: PaletteAction) => void;
  hasCurrentCompany: boolean;
}

interface ActionItem {
  key: PaletteAction;
  label: string;
  icon: React.ReactNode;
  needsCompany?: boolean;
}

const ALL_ACTIONS: ActionItem[] = [
  { key: "refresh", label: "Refresh attention data", icon: <Icon.Refresh /> },
  { key: "open-company-in-hubspot", label: "Open company in HubSpot", icon: <Icon.External />, needsCompany: true },
  { key: "open-deal-in-hubspot", label: "Open deal in HubSpot", icon: <Icon.External />, needsCompany: true },
];

interface PickableAction { kind: "action"; a: ActionItem }
interface PickableCompany { kind: "company"; c: CompanySearchResult }
type Pickable = PickableAction | PickableCompany;
type Item = { section: string } | Pickable;

export function CommandPalette({
  open,
  onClose,
  onPickCompany,
  onAction,
  hasCurrentCompany,
}: CommandPaletteProps) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Live company search (debounced) when typing. AbortController cancels any
  // in-flight request when the query changes, so a slow response for "stau"
  // can't overwrite the fresh response for "stauning".
  useEffect(() => {
    if (!open) return;
    if (q.length < 1) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const ctrl = new AbortController();
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setIdx(0);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setIsLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      ctrl.abort();
    };
  }, [q, open]);

  if (!open) return null;

  const bookmarks: CompanySearchResult[] = getBookmarks()
    .slice(0, 8)
    .map((b) => ({ id: b.id, name: b.name, domain: b.domain || "" }));
  const bookmarkIds = new Set(bookmarks.map((b) => b.id));
  const recents: CompanySearchResult[] = getRecentCompanies()
    .slice(0, 6)
    .filter((r) => !bookmarkIds.has(r.id)) // dedupe — bookmarks beat recents
    .map((r) => ({ id: r.id, name: r.name, domain: r.domain || "" }));

  const filterText = (s: string) => s.toLowerCase().includes(q.toLowerCase());
  const visibleActions = ALL_ACTIONS
    .filter((a) => !a.needsCompany || hasCurrentCompany)
    .filter((a) => (q ? filterText(a.label) : true));

  const items: Item[] = [];
  if (visibleActions.length > 0) {
    items.push({ section: "Actions" });
    visibleActions.forEach((a) => items.push({ kind: "action", a }));
  }
  if (q) {
    if (results.length > 0) {
      items.push({ section: "Companies" });
      results.forEach((c) => items.push({ kind: "company", c }));
    }
  } else {
    if (bookmarks.length > 0) {
      items.push({ section: "Bookmarked" });
      bookmarks.forEach((c) => items.push({ kind: "company", c }));
    }
    if (recents.length > 0) {
      items.push({ section: "Recent" });
      recents.forEach((c) => items.push({ kind: "company", c }));
    }
  }

  const pickable: Pickable[] = items.filter((i): i is Pickable => "kind" in i);

  function choose(p: Pickable | undefined) {
    if (!p) return;
    if (p.kind === "company") onPickCompany(p.c);
    else onAction(p.a.key);
    onClose();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, pickable.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(pickable[idx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  let pIdx = -1;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,44,18,0.35)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        zIndex: 100,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "14vh",
        animation: "fadeIn 140ms ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="animate-scaleIn"
        style={{
          width: 640,
          maxWidth: "92vw",
          background: "var(--card-bg)",
          borderRadius: 14,
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative" }}>
          <input
            ref={inputRef}
            aria-label="Search companies or run a command"
            placeholder="Search companies or run a command…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={handleKey}
            style={{
              width: "100%",
              padding: "18px 20px",
              fontSize: 16,
              outline: 0,
              fontFamily: "var(--font-body)",
              borderBottom: "1px solid var(--hairline)",
              background: "var(--card-bg)",
            }}
          />
          {isLoading && (
            <span
              style={{
                position: "absolute",
                right: 18,
                top: "50%",
                transform: "translateY(-50%)",
                width: 14,
                height: 14,
                border: "2px solid var(--hairline)",
                borderTopColor: "var(--moss)",
                borderRadius: "50%",
                animation: "spin 0.7s linear infinite",
              }}
            />
          )}
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto", padding: "6px 0" }}>
          {items.length === 0 && (
            <div
              style={{
                padding: "28px 20px",
                textAlign: "center",
                color: "var(--green-100)",
                fontSize: 13,
                fontStyle: "italic",
                fontFamily: "var(--font-editorial)",
              }}
            >
              {q.length >= 1 ? "No matches." : "Type to search, or pick a recent company."}
            </div>
          )}
          {items.map((it, i) => {
            if ("section" in it) {
              return (
                <div
                  key={`s-${i}`}
                  style={{
                    padding: "8px 20px 4px",
                    fontFamily: "var(--font-display)",
                    textTransform: "uppercase",
                    fontSize: 10.5,
                    letterSpacing: "0.06em",
                    color: "var(--green-100)",
                    fontWeight: 700,
                  }}
                >
                  {it.section}
                </div>
              );
            }
            pIdx++;
            const active = pIdx === idx;
            const baseStyle: React.CSSProperties = {
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 20px",
              cursor: "pointer",
              fontSize: 13.5,
              transition: "background 100ms ease",
              background: active ? "var(--light-grey)" : "transparent",
              width: "100%",
              textAlign: "left" as const,
            };
            if (it.kind === "action") {
              return (
                <button
                  key={`a-${i}`}
                  style={baseStyle}
                  onMouseEnter={() => setIdx(pickable.findIndex((x) => x === it))}
                  onClick={() => choose(it)}
                >
                  <span style={{ width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--green-100)" }}>
                    {it.a.icon}
                  </span>
                  <span style={{ color: "var(--moss)" }}>{it.a.label}</span>
                </button>
              );
            }
            const c = it.c;
            return (
              <button
                key={`c-${c.id}-${i}`}
                style={baseStyle}
                onMouseEnter={() => setIdx(pickable.findIndex((x) => x === it))}
                onClick={() => choose(it)}
              >
                <span style={{ width: 22, display: "inline-flex", justifyContent: "center" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--moss)" }} />
                </span>
                <span style={{ fontWeight: 500, color: "var(--moss)" }}>{c.name}</span>
                {c.domain && (
                  <span style={{ fontSize: 11, color: "var(--green-100)", marginLeft: 6 }}>{c.domain}</span>
                )}
                {c.healthScore && (
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--green-100)" }}>{c.healthScore}</span>
                )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            padding: "8px 20px",
            borderTop: "1px solid var(--hairline)",
            fontSize: 11,
            color: "var(--green-100)",
            display: "flex",
            gap: 14,
          }}
        >
          <span>
            <span className="kbd">↑↓</span> navigate
          </span>
          <span>
            <span className="kbd">↵</span> select
          </span>
          <span>
            <span className="kbd">esc</span> close
          </span>
        </div>
      </div>
    </div>
  );
}
