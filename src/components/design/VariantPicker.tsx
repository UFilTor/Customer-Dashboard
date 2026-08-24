"use client";

import { useEffect, useRef, useState } from "react";
import {
  prefetchAttention,
  prefetchMeetingPrep,
  prefetchPayMigration,
  prefetchPortfolio,
  prefetchSearch,
} from "@/lib/prefetch";

export type Variant = "briefing" | "split";
export type DashboardKey =
  | "status"
  | "portfolio"
  | "meeting_prep"
  | "pay_migration"
  | "bloom"
  | "search";

interface DashboardDef {
  key: DashboardKey;
  label: string;
  sub: string;
  /** Second key of the "g" chord that jumps to this dashboard (g + chord).
   *  The keyboard handler in page-client and the shortcut cheat sheet both
   *  derive from this, so hiding a dashboard disables its chord and
   *  un-hiding restores it with no per-file cleanup needed. */
  chord: string;
  /** Whether the dashboard is wired up. Unavailable entries render in the
   *  picker as disabled "coming soon" rows (e.g. Bloom). */
  available: boolean;
  /** Removes the entry from the picker entirely (and disables its "g"
   *  chord) while keeping the route + code paths reachable via URL. Use
   *  for legacy dashboards we want to preserve as a fallback (e.g. Status
   *  after Portfolio replaced it). */
  hidden?: boolean;
}

export const DASHBOARDS: DashboardDef[] = [
  { key: "portfolio",     label: "Portfolio",     sub: "Every account, every signal", chord: "p", available: true  },
  // Status is the legacy dashboard. Hidden from the picker now that Portfolio
  // covers the same surface; URL `?d=status` still resolves so we can flip
  // back to visible if we ever need to re-expose it.
  { key: "status",        label: "Status",        sub: "Needs attention today (legacy)", chord: "s", available: true, hidden: true },
  { key: "meeting_prep",  label: "Meeting prep",  sub: "Today's meetings, prep ready", chord: "m", available: true },
  { key: "pay_migration", label: "Understory Pay Migration", sub: "Moving accounts to Understory Pay", chord: "u", available: true },
  { key: "bloom",         label: "Bloom",         sub: "Marketing candidates to pitch", chord: "b", available: false },
  // Lookup is hidden from the picker (feature kept; URL `?d=search` still
  // resolves). Flip `hidden` off to bring back the picker row and the
  // `g l` chord together.
  { key: "search",        label: "Lookup",        sub: "Ask anything in plain English", chord: "l", available: true, hidden: true },
];

interface VariantPickerProps {
  variant: Variant;
  setVariant: (v: Variant) => void;
  dashboard: DashboardKey;
  payFilter?: "default" | "all";
  setPayFilter?: (v: "default" | "all") => void;
  portfolioView?: "table" | "board";
  setPortfolioView?: (v: "table" | "board") => void;
}

const VARIANTS: { key: Variant; label: string }[] = [
  { key: "briefing", label: "Daily briefing" },
  { key: "split", label: "Split view" },
];

export function VariantPicker({
  variant,
  setVariant,
  dashboard,
  payFilter,
  setPayFilter,
  portfolioView,
  setPortfolioView,
}: VariantPickerProps) {
  const showLayout = dashboard === "status";
  const showPayFilter = dashboard === "pay_migration" && setPayFilter && payFilter;
  const showPortfolioView =
    dashboard === "portfolio" && setPortfolioView && portfolioView;

  // Dashboards without variant tabs (Meeting Prep, Lookup) skip the sub-bar
  // entirely. DashboardPicker in the TopBar already names the current
  // dashboard, so a second bar with no controls was empty chrome.
  if (!showLayout && !showPayFilter && !showPortfolioView) return null;

  return (
    <div
      style={{
        background: "var(--light-grey)",
        borderBottom: "1px solid var(--beige-gray)",
      }}
    >
      <div
        style={{
          padding: "10px var(--page-gutter)",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        {showLayout ? (
          <SegLight label="Status view">
            {VARIANTS.map((v) => (
              <button
                key={v.key}
                role="tab"
                aria-selected={variant === v.key}
                onClick={() => setVariant(v.key)}
                className={variant === v.key ? "seg-light-btn active" : "seg-light-btn"}
              >
                {v.label}
              </button>
            ))}
          </SegLight>
        ) : showPortfolioView ? (
          <SegLight label="Portfolio layout">
            {([
              { key: "table", label: "Table" },
              { key: "board", label: "Board" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                role="tab"
                aria-selected={portfolioView === opt.key}
                onClick={() => setPortfolioView!(opt.key)}
                className={portfolioView === opt.key ? "seg-light-btn active" : "seg-light-btn"}
              >
                {opt.label}
              </button>
            ))}
          </SegLight>
        ) : (
          <SegLight label="Pay migration scope">
            {([
              { key: "default", label: "Default" },
              { key: "all", label: "All" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                role="tab"
                aria-selected={payFilter === opt.key}
                onClick={() => setPayFilter!(opt.key)}
                className={payFilter === opt.key ? "seg-light-btn active" : "seg-light-btn"}
              >
                {opt.label}
              </button>
            ))}
          </SegLight>
        )}
      </div>
    </div>
  );
}

function SegLight({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      style={{
        display: "inline-flex",
        background: "var(--beige-new)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 10,
        padding: 3,
        gap: 2,
      }}
    >
      {children}
    </div>
  );
}

export function DashboardPicker({
  dashboard,
  setDashboard,
}: {
  dashboard: DashboardKey;
  setDashboard: (d: DashboardKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = DASHBOARDS.find((d) => d.key === dashboard) || DASHBOARDS[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Open / close from outside (page-level "g" prefix triggers this).
  useEffect(() => {
    function onOpen() { setOpen(true); }
    function onClose() { setOpen(false); }
    window.addEventListener("ud-dashboard-picker-open", onOpen);
    window.addEventListener("ud-dashboard-picker-close", onClose);
    return () => {
      window.removeEventListener("ud-dashboard-picker-open", onOpen);
      window.removeEventListener("ud-dashboard-picker-close", onClose);
    };
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="dashboard-picker-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="ud-dashboard-picker-listbox"
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9.5,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--citrus)",
          }}
        >
          Dashboard
        </span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 14,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "-0.005em",
          }}
        >
          {current.label}
        </span>
        <svg
          width={10}
          height={10}
          viewBox="0 0 10 10"
          fill="none"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          id="ud-dashboard-picker-listbox"
          aria-label="Dashboards"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 320,
            background: "var(--light-grey)",
            border: "1px solid var(--beige-gray)",
            borderRadius: 12,
            padding: 6,
            zIndex: 100,
            boxShadow: "var(--shadow-modal)",
          }}
        >
          {DASHBOARDS.filter((d) => !d.hidden).map((d) => {
            const isActive = d.key === dashboard;
            const disabled = !d.available;
            return (
              <button
                key={d.key}
                role="option"
                aria-selected={isActive}
                aria-disabled={disabled || undefined}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  setDashboard(d.key);
                  setOpen(false);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  textAlign: "left",
                  background: isActive ? "var(--beige-new)" : "transparent",
                  transition: "background 0.15s",
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.55 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isActive && !disabled) {
                    e.currentTarget.style.background = "var(--beige-new)";
                    // Prefetch the bulk endpoint + dynamic chunk so the click
                    // resolves with both code and data already in flight.
                    if (d.key === "status") prefetchAttention();
                    else if (d.key === "portfolio") prefetchPortfolio();
                    else if (d.key === "pay_migration") prefetchPayMigration();
                    else if (d.key === "meeting_prep") prefetchMeetingPrep();
                    else if (d.key === "search") prefetchSearch();
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: "var(--font-display)",
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "-0.005em",
                    color: "var(--moss)",
                  }}
                >
                  {d.label}
                  {disabled && (
                    <span
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        background: "var(--beige-gray)",
                        color: "var(--moss)",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      Soon
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--green-100)",
                    fontFamily: "var(--font-editorial)",
                    fontStyle: "italic",
                    marginTop: 2,
                  }}
                >
                  {d.sub}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
