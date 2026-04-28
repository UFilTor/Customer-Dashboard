"use client";

import { useEffect, useRef, useState } from "react";
import { fmtEur } from "@/lib/format-design";

export type Variant = "briefing" | "split";
export type DashboardKey = "status" | "onboarding" | "retention" | "pay_migration" | "bloom";

interface DashboardDef {
  key: DashboardKey;
  label: string;
  sub: string;
  available: boolean;
}

export const DASHBOARDS: DashboardDef[] = [
  { key: "status", label: "Status", sub: "Needs attention today", available: true },
  { key: "onboarding", label: "Onboarding", sub: "New customers getting live", available: true },
  { key: "retention", label: "Retention", sub: "Churn risk + renewals", available: false },
  { key: "pay_migration", label: "Pay migration", sub: "Moving accounts to Understory Pay", available: true },
  { key: "bloom", label: "Bloom", sub: "Marketing candidates to pitch", available: false },
];

export type OnboardingSubview = "meetings" | "attention";

interface VariantPickerProps {
  variant: Variant;
  setVariant: (v: Variant) => void;
  dashboard: DashboardKey;
  setDashboard: (d: DashboardKey) => void;
  totalCount: number;
  urgentCount: number;
  revenueAtRisk: number;
  payFilter?: "default" | "all";
  setPayFilter?: (v: "default" | "all") => void;
  onboardingSubview?: OnboardingSubview;
  setOnboardingSubview?: (v: OnboardingSubview) => void;
}

const VARIANTS: { key: Variant; label: string }[] = [
  { key: "briefing", label: "Daily briefing" },
  { key: "split", label: "Split view" },
];

export function VariantPicker({
  variant,
  setVariant,
  dashboard,
  setDashboard,
  totalCount,
  urgentCount,
  revenueAtRisk,
  payFilter,
  setPayFilter,
  onboardingSubview,
  setOnboardingSubview,
}: VariantPickerProps) {
  const showLayout = dashboard === "status";
  const showPayFilter = dashboard === "pay_migration" && setPayFilter && payFilter;
  const showOnboardingTabs =
    dashboard === "onboarding" && setOnboardingSubview && onboardingSubview;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "var(--light-grey)",
        borderBottom: "1px solid var(--beige-gray)",
      }}
    >
      <div
        style={{
          padding: "10px 20px",
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
        ) : showPayFilter ? (
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
        ) : showOnboardingTabs ? (
          <SegLight label="Onboarding view">
            {([
              { key: "meetings", label: "Meeting prep" },
              { key: "attention", label: "Needs attention" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                role="tab"
                aria-selected={onboardingSubview === opt.key}
                onClick={() => setOnboardingSubview!(opt.key)}
                className={onboardingSubview === opt.key ? "seg-light-btn active" : "seg-light-btn"}
              >
                {opt.label}
              </button>
            ))}
          </SegLight>
        ) : (
          <span
            style={{
              fontSize: 12,
              color: "var(--green-100)",
              fontStyle: "italic",
              fontFamily: "var(--font-editorial)",
            }}
          >
            {DASHBOARDS.find((d) => d.key === dashboard)?.sub}
          </span>
        )}

        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {dashboard === "status" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 12,
                color: "var(--green-100)",
              }}
            >
              <span>
                <strong style={{ color: "var(--moss)" }}>{totalCount}</strong> needing attention
              </span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>
                <strong style={{ color: "var(--rust)" }}>{urgentCount}</strong> urgent
              </span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{fmtEur(revenueAtRisk)} at risk</span>
            </div>
          )}
          <DashboardPicker dashboard={dashboard} setDashboard={setDashboard} />
        </div>
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

function DashboardPicker({
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
            boxShadow: "0 12px 40px rgba(2,44,18,0.18)",
          }}
        >
          {DASHBOARDS.map((d) => {
            const isActive = d.key === dashboard;
            const disabled = !d.available;
            return (
              <button
                key={d.key}
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
                  if (!isActive && !disabled) e.currentTarget.style.background = "var(--beige-new)";
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
