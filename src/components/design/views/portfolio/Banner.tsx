"use client";

// Extracted from PortfolioView.tsx. Presentation only, no data fetching.
// The container (PortfolioContainer.tsx) still owns all state; these
// components receive everything through props exactly as before.

import { type PortfolioSignalKey } from "@/lib/types";
import { fmtEur } from "@/lib/format-design";
import { DashboardBanner } from "../../DashboardBanner";

export function Banner({
  totalRows,
  totalValueEur,
  totalsBySignal,
  filterLabel,
  selectedSignals,
  toggleSignal,
}: {
  totalRows: number;
  totalValueEur: number;
  totalsBySignal: Record<PortfolioSignalKey, number>;
  filterLabel: string | null;
  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (k: PortfolioSignalKey) => void;
}) {
  const eyebrow = filterLabel ? `Portfolio · ${filterLabel}` : "Portfolio";

  if (totalRows === 0) {
    return (
      <DashboardBanner
        eyebrow={eyebrow}
        headline={<>No accounts in scope.</>}
        detail={<>Try a different filter to widen the search.</>}
      />
    );
  }

  // Categorical breakdown of the four bad-severity signal counts. We dropped
  // the single "X urgent" total because at scale (53% of book) the word
  // stopped meaning anything; per-category counts let the eye find the
  // cluster that matters today and skip past quiet days entirely. Sorted
  // descending so the heaviest category lands first (left-to-right reading
  // order = priority order); same-style fragments rely on position alone to
  // rank because making the top number bigger competed with the headline.
  // Each fragment doubles as a one-click filter into the matching signal.
  // Replaces the current selection (clear + set) so the eye lands on the
  // group it just clicked instead of stacking onto an unrelated filter.
  const breakdown: Array<{ count: number; label: string; signal: PortfolioSignalKey }> = [
    { count: totalsBySignal.overdue_invoices, label: "overdue",       signal: "overdue_invoices" as PortfolioSignalKey },
    { count: totalsBySignal.wish_to_churn,    label: "wish to churn", signal: "wish_to_churn" as PortfolioSignalKey },
    { count: totalsBySignal.volume_declining, label: "volume drops",  signal: "volume_declining" as PortfolioSignalKey },
    { count: totalsBySignal.no_future_events, label: "no events",     signal: "no_future_events" as PortfolioSignalKey },
  ]
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  // Multi-select toggle, identical to the dropdown rows. Avoids silently
  // wiping a user's existing 3-signal filter set when they click a banner
  // fragment to focus on something else; instead the click adds/removes
  // the signal from the current selection like every other filter affordance.
  const applyFragment = (sig: PortfolioSignalKey) => {
    toggleSignal(sig);
  };

  return (
    <DashboardBanner
      eyebrow={eyebrow}
      headline={
        <>
          {totalRows} {totalRows === 1 ? "customer" : "customers"}
          {/* Portfolio value: accumulated ACV of the current filtered set.
              Lives in the headline (not the detail row) because the detail
              fragments are clickable filters and a static value there would
              break that affordance. fmtEur renders 0 as "—", so skip it. */}
          {totalValueEur > 0 && <> · {fmtEur(totalValueEur)} ACV</>}
        </>
      }
      detail={
        breakdown.length === 0 ? (
          <>Nothing flagged today.</>
        ) : (
          <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "baseline" }}>
            {breakdown.map((item, i) => {
              const active = selectedSignals.includes(item.signal);
              return (
                <span key={item.label} style={{ whiteSpace: "nowrap" }}>
                  {i > 0 && (
                    <span aria-hidden="true" style={{ opacity: 0.45, padding: "0 8px" }}>·</span>
                  )}
                  <button
                    type="button"
                    className={`pf-banner-frag${active ? " active" : ""}`}
                    onClick={() => applyFragment(item.signal)}
                    aria-pressed={active}
                    aria-label={`Filter to ${item.count} ${item.label}`}
                    style={{ padding: "1px 6px" }}
                  >
                    <span style={{ fontWeight: 600 }}>{item.count}</span> {item.label}
                  </button>
                </span>
              );
            })}
          </span>
        )
      }
    />
  );
}

// ---------- Toolbar (filter + sort triggers) ----------
