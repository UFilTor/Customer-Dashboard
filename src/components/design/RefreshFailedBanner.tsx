// Shown above a dashboard when a refetch fails while an earlier payload is
// still on screen. The container keeps rendering that payload, so a failed
// refresh never throws away the user's place (scroll, expanded lists, focus).
// friendlyErrorMessage() returns full sentences, hence no colon or trailing
// period around {error}.
export function RefreshFailedBanner({ error }: { error: string }) {
  return (
    <div
      role="status"
      style={{
        background: "color-mix(in oklch, var(--rust) 14%, transparent)",
        color: "var(--rust)",
        padding: "8px 28px",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 500,
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      Refresh failed. {error} Showing cached data.
    </div>
  );
}
