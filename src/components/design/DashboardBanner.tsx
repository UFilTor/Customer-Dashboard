"use client";

import { type ReactNode, useSyncExternalStore } from "react";

// Shared moss banner used across Portfolio, Meeting Prep, Pay Migration, and
// Lookup. Flat moss surface (DESIGN.md "no gradients"), single citrus moment
// reserved for an in-line accent in `detail` if the caller chooses, neutrals
// tinted via color-mix from --page-bg.
interface DashboardBannerProps {
  eyebrow: string;
  headline: ReactNode;
  detail?: ReactNode;
}

export function DashboardBanner({ eyebrow, headline, detail }: DashboardBannerProps) {
  const dateStr = useDateLabel();
  const greeting = useGreeting();

  return (
    <div className="page-gutter" style={{ paddingTop: 20 }}>
      <div
        className="page-max"
        style={{
          background: "var(--moss)",
          color: "var(--page-bg)",
          borderRadius: 18,
          padding: "22px 32px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "color-mix(in oklch, var(--page-bg) 70%, transparent)",
            }}
          >
            {eyebrow}
          </span>
          <span
            style={{
              width: 24,
              height: 1,
              background: "color-mix(in oklch, var(--page-bg) 28%, transparent)",
            }}
          />
          <span
            suppressHydrationWarning
            style={{
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
              fontSize: 12,
              color: "color-mix(in oklch, var(--page-bg) 72%, transparent)",
            }}
          >
            {dateStr}
          </span>
        </div>

        <div
          suppressHydrationWarning
          style={{
            marginTop: 12,
            fontFamily: "var(--font-editorial)",
            fontStyle: "italic",
            fontSize: 22,
            fontWeight: 400,
            color: "var(--page-bg)",
            lineHeight: 1.15,
            letterSpacing: "-0.005em",
          }}
        >
          {greeting ? `${greeting}.` : ""}
        </div>

        <h1
          style={{
            margin: "4px 0 0",
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: "-0.005em",
            lineHeight: 1.1,
            color: "var(--page-bg)",
            maxWidth: 720,
          }}
        >
          {headline}
        </h1>

        {detail && (
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              color: "color-mix(in oklch, var(--page-bg) 78%, transparent)",
              lineHeight: 1.55,
              maxWidth: 720,
            }}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

function useDateLabel(): string {
  const mounted = useMounted();
  if (!mounted) return "";
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function useGreeting(): string {
  const mounted = useMounted();
  if (!mounted) return "";
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}
