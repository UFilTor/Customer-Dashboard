"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { deleteView, getDefaultViewIdServerSnapshot, getDefaultViewIdSnapshot, getSavedViewsServerSnapshot, getSavedViewsSnapshot, saveView, setDefaultView, subscribeSavedViews, type PortfolioShownStatuses, type PortfolioViewState, type SavedPortfolioView } from "@/lib/portfolio-views";
import { type PortfolioRefineState } from "@/lib/types";
import { Caret, eyebrowStyle, pillTriggerStyle, useOutsideClose } from "./chrome";

// Order-insensitive fingerprint of a filter object. "Off" values (unset,
// false, empty string, empty list) are dropped so `{ stages: [] }` and `{}`
// compare equal, and lists are sorted so selection order doesn't matter.
function filterFingerprint(obj: PortfolioRefineState | PortfolioShownStatuses): string {
  const entries = Object.entries(obj)
    .filter(([, v]) => v != null && v !== false && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(entries);
}

// "Edited" compares only the filters (Signals, Any/All, Refine, Status).
// Sort and collapsed board columns are presentation, not filters, so
// changing them never marks a view as edited.
export function sameFilters(a: PortfolioViewState, b: PortfolioViewState): boolean {
  return (
    [...a.signals].sort().join(",") === [...b.signals].sort().join(",") &&
    a.stackedSignals === b.stackedSignals &&
    filterFingerprint(a.refine) === filterFingerprint(b.refine) &&
    filterFingerprint(a.shownStatuses) === filterFingerprint(b.shownStatuses)
  );
}

export function ViewsPill({
  currentViewState,
  onApplyView,
  activeViewId,
}: {
  currentViewState: PortfolioViewState;
  onApplyView: (view: SavedPortfolioView) => void;
  activeViewId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  useOutsideClose(wrapRef, open, () => setOpen(false));

  // Views live in localStorage (per device, see portfolio-views.ts).
  // useSyncExternalStore keeps this lint-clean (no setState-in-effect) and
  // SSR-safe (server snapshot is a stable empty list).
  const views = useSyncExternalStore(
    subscribeSavedViews,
    getSavedViewsSnapshot,
    getSavedViewsServerSnapshot
  );
  const defaultViewId = useSyncExternalStore(
    subscribeSavedViews,
    getDefaultViewIdSnapshot,
    getDefaultViewIdServerSnapshot
  );

  // A deleted view simply stops matching, so the pill falls back to "N saved".
  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const edited = activeView != null && !sameFilters(activeView.state, currentViewState);

  // Reset the name form whenever the popup closes (adjust-during-render).
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    setNaming(false);
    setName("");
  }

  // ⇧V mirrors ⇧F / ⇧S / ⇧T; Escape dismisses. Bails on meta/ctrl only —
  // altKey stays allowed for Nordic layouts.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      const inInput =
        target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (inInput) return;
      if (e.metaKey || e.ctrlKey) return;
      if (!e.shiftKey) return;
      if (e.key === "V" || e.key === "v") {
        setOpen((v) => !v);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mirror open-state to page-client so list-nav yields while open.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("ud-portfolio-popup-state", { detail: open })
    );
  }, [open]);

  function handleSave() {
    const saved = saveView(name, currentViewState);
    if (saved) {
      // The current filters now are this view, so it becomes the active one.
      onApplyView(saved);
      setNaming(false);
      setName("");
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={pillTriggerStyle(false)}
        aria-label={activeView ? `Views: ${activeView.name}${edited ? ", edited" : ""}` : undefined}
      >
        <span style={eyebrowStyle}>Views</span>
        {activeView ? (
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
            <span
              title={activeView.name}
              style={{
                whiteSpace: "nowrap",
                fontWeight: 600,
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {activeView.name}
            </span>
            {/* Text, not just a dot, so the state doesn't rely on color. */}
            {edited && (
              <span style={{ whiteSpace: "nowrap", color: "var(--green-100)", fontWeight: 400 }}>
                · edited
              </span>
            )}
          </span>
        ) : (
          <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
            {views.length > 0 ? `${views.length} saved` : "None"}
          </span>
        )}
        <span className="kbd">⇧V</span>
        <Caret open={open} />
      </button>
      {open && (
        <div className="pf-pop" style={{ right: 0, width: 300 }}>
          <div
            style={{
              padding: "10px 14px 8px 20px",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <div style={eyebrowStyle}>Saved views</div>
          </div>
          <div style={{ padding: 6 }}>
            {views.length === 0 && !naming && (
              <div
                style={{
                  padding: "10px 14px",
                  fontSize: 12,
                  color: "var(--green-100)",
                  fontStyle: "italic",
                  fontFamily: "var(--font-editorial)",
                  lineHeight: 1.5,
                }}
              >
                No saved views yet. Set up your filters and sort, then save
                them here to come back with one click.
              </div>
            )}
            {views.map((v) => {
              const isDefault = v.id === defaultViewId;
              return (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <button
                    className="pf-pop-row"
                    style={{ flex: 1, minWidth: 0 }}
                    aria-current={v.id === activeView?.id ? "true" : undefined}
                    onClick={() => {
                      onApplyView(v);
                      setOpen(false);
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textAlign: "left",
                      }}
                    >
                      {v.name}
                    </span>
                    {isDefault && (
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "var(--green-100)",
                          background: "var(--beige)",
                          padding: "2px 6px",
                          borderRadius: 5,
                        }}
                      >
                        Default
                      </span>
                    )}
                  </button>
                  <button
                    aria-label={
                      isDefault
                        ? `Stop applying ${v.name} as the default view`
                        : `Apply ${v.name} as the default view on load`
                    }
                    title={isDefault ? "Default view — click to clear" : "Set as default view"}
                    aria-pressed={isDefault}
                    onClick={() => setDefaultView(isDefault ? null : v.id)}
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: "transparent",
                      color: isDefault ? "var(--moss)" : "var(--green-100)",
                      fontSize: 13,
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {isDefault ? "★" : "☆"}
                  </button>
                  <button
                    aria-label={`Delete view ${v.name}`}
                    title={`Delete view ${v.name}`}
                    onClick={() => deleteView(v.id)}
                    style={{
                      flexShrink: 0,
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: "transparent",
                      color: "var(--green-100)",
                      fontSize: 12,
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid var(--hairline)", padding: 6 }}>
            {naming ? (
              <div style={{ display: "flex", gap: 6, padding: "4px 6px" }}>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                  placeholder="View name"
                  aria-label="View name"
                  maxLength={40}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12.5,
                    padding: "6px 8px",
                    border: "1px solid var(--hairline)",
                    borderRadius: 6,
                    background: "var(--card-bg)",
                    color: "var(--moss)",
                  }}
                />
                <button
                  onClick={handleSave}
                  disabled={!name.trim()}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "6px 10px",
                    borderRadius: 6,
                    background: name.trim() ? "var(--moss)" : "var(--hairline)",
                    color: name.trim() ? "var(--text-on-moss)" : "var(--green-100)",
                    cursor: name.trim() ? "pointer" : "default",
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <button className="pf-pop-row" onClick={() => setNaming(true)}>
                <span style={{ flex: 1, textAlign: "left" }}>+ Save current view…</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Refine pill ----------
