// Route-level Suspense fallback shown while the dashboard chunk hydrates or
// while a client transition is in flight. Matches the live shape of the
// dashboards that share this route — moss banner, toolbar pills, column
// header strip, dense row stack — so the swap to real content doesn't cause
// a layout jump. The previous hero+KPI+5-row layout came from an earlier
// design and didn't match any current view.
export default function Loading() {
  return (
    <div
      className="animate-pulse"
      style={{
        background: "var(--page-bg)",
        minHeight: "calc(100vh - 120px)",
      }}
    >
      <div style={{ padding: "20px 28px 0" }}>
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            background: "var(--moss)",
            borderRadius: 16,
            height: 154,
            opacity: 0.85,
          }}
        />
      </div>
      <div style={{ padding: "0 28px 60px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
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
                  gridTemplateColumns: "96px 1fr 280px 60px 80px 48px 44px",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: i === 7 ? "none" : "1px solid var(--hairline)",
                }}
              >
                <span style={{ height: 16, background: "var(--hairline)", borderRadius: 4 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, width: "70%" }} />
                <span style={{ height: 16, background: "var(--hairline)", borderRadius: 4, width: "55%" }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 28 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 48 }} />
                <span style={{ height: 12, background: "var(--hairline)", borderRadius: 4, justifySelf: "end", width: 28 }} />
                <span style={{ height: 24, width: 24, background: "var(--hairline)", borderRadius: "50%", justifySelf: "end" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
