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
  // Matches the dashboard's content max-width so the banner aligns with the
  // surface beneath it (Portfolio + Meeting Prep at 1200, Pay Migration at
  // 1280, Lookup at 1080). Defaults to 1200.
  maxWidth?: number;
}

export function DashboardBanner({ eyebrow, headline, detail, maxWidth = 1200 }: DashboardBannerProps) {
  const dateStr = useDateLabel();
  const greeting = useGreeting();

  return (
    <div style={{ padding: "20px 28px 0" }}>
      <div
        style={{
          maxWidth,
          margin: "0 auto",
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
