// Route-level Suspense fallback shown while the dashboard chunk hydrates
// or while a client transition is in flight. Matches the in-app ListLoading
// shape so the swap to real content doesn't cause a layout jump.
export default function Loading() {
  return (
    <div
      className="animate-pulse"
      style={{
        padding: "32px 28px",
        maxWidth: 1080,
        margin: "0 auto",
        minHeight: "60vh",
      }}
    >
      {/* Hero block */}
      <div
        style={{
          height: 200,
          background: "var(--hairline)",
          borderRadius: 20,
          marginBottom: 28,
        }}
      />
      {/* KPI strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 96,
              background: "var(--hairline)",
              borderRadius: 14,
            }}
          />
        ))}
      </div>
      {/* List rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: 64,
              background: "var(--hairline)",
              borderRadius: 12,
            }}
          />
        ))}
      </div>
    </div>
  );
}
