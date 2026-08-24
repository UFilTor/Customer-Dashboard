"use client";

// Route-level Suspense fallback shown while the dashboard chunk hydrates or
// while a client transition is in flight. Matches the live shape of the
// dashboards that share this route — moss banner, toolbar pills, column
// header strip, dense row stack — so the swap to real content doesn't cause
// a layout jump. The previous hero+KPI+5-row layout came from an earlier
// design and didn't match any current view. Client component so it can share
// the row grid template with the live table instead of drifting.
import { COLS_GRID_WITH_OWNER } from "@/components/design/views/portfolio/chrome";

export default function Loading() {
  return (
    <div
      className="animate-pulse"
      style={{
        background: "var(--page-bg)",
        minHeight: "calc(100vh - 120px)",
      }}
    >
      <div className="page-gutter" style={{ paddingTop: 20 }}>
        <div
          className="page-max"
          style={{
            background: "var(--moss)",
            borderRadius: 16,
            height: 154,
            opacity: 0.85,
          }}
        />
      </div>
      <div className="page-gutter" style={{ paddingBottom: 60 }}>
        <div className="page-max">
          <div style={{ display: "flex", gap: 8, padding: "12px 0" }}>
            <div style={{ height: 36, width: 180, background: "var(--hairline)", borderRadius: 8 }} />
            <div style={{ flex: 1 }} />
            <div style={{ height: 36, width: 180, background: "var(--hairline)", borderRadius: 8 }} />
          </div>
          <div
            style={{
              height: 36,
              background: "var(--card-bg)",
              border: "1px solid var(--hairline)",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
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
              borderBottomLeftRadius: 16,
              borderBottomRightRadius: 16,
              overflow: "hidden",
            }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: COLS_GRID_WITH_OWNER,
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 18px",
                  borderBottom: i === 7 ? "none" : "1px solid var(--hairline)",
                }}
              >
                <span style={{ height: 16, background: "var(--hairline)", borderRadius: 4 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, width: "70%" }} />
                <span style={{ height: 16, background: "var(--hairline)", borderRadius: 4, width: "55%" }} />
                <span aria-hidden />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 28 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 48 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 28 }} />
                <span style={{ height: 24, width: 24, background: "var(--hairline)", borderRadius: "50%", justifySelf: "end" }} />
                <span style={{ height: 24, background: "var(--hairline)", borderRadius: 6, justifySelf: "end", width: 120 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
