import type { PayStage } from "@/lib/types";

const STAGE_ORDER: PayStage[] = [
  "Live",
  "Verified",
  "Pending Verification",
  "Started Onboarding",
  "Signed - Not Started",
  "Not yet enrolled",
  "Unwilling",
];

const STAGE_COLORS: Record<PayStage, string> = {
  "Live": "#065F46",
  "Verified": "#6EE7B7",
  "Pending Verification": "#FCD34D",
  "Started Onboarding": "#FDBA74",
  "Signed - Not Started": "#93C5FD",
  "Not yet enrolled": "#D1D5DB",
  "Unwilling": "#FCA5A5",
  "Ineligible": "#9CA3AF",
};

const PIPELINE_ABBREV: Record<string, string> = {
  "Live": "Live",
  "Verified": "Verified",
  "Pending Verification": "Pending",
  "Started Onboarding": "Started Onb.",
  "Signed - Not Started": "Signed",
  "Not yet enrolled": "Not yet enrolled",
  "Unwilling": "Unwilling",
};

function formatBv(value: number): string {
  if (value === 0) return "€0";
  if (value < 1000) return `€${Math.round(value)}`;
  if (value < 999500) return `€${Math.round(value / 1000)}k`;
  const m = value / 1000000;
  return `€${m % 1 === 0 ? m : m.toFixed(1)}M`;
}

interface Props {
  stageBreakdown: Record<PayStage, { count: number; bv: number }>;
  eligibleBv: number;
  ineligibleBv: number;
}

export function PayPipelineChart({ stageBreakdown, eligibleBv, ineligibleBv }: Props) {
  // Pipeline bar excludes Ineligible
  const totalPipeBv = STAGE_ORDER.reduce((sum, s) => sum + stageBreakdown[s].bv, 0);
  if (totalPipeBv === 0) return null;

  const allSegments = STAGE_ORDER.map((stage) => ({
    stage,
    ...stageBreakdown[stage],
    color: STAGE_COLORS[stage],
    pct: totalPipeBv > 0 ? (stageBreakdown[stage].bv / totalPipeBv) * 100 : 0,
  }));

  const barSegments = allSegments.filter((s) => s.bv > 0);

  return (
    <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 mb-6">
      <h3 className="text-sm font-semibold text-[var(--moss)] mb-1">
        Full Pipeline - BV Breakdown
      </h3>
      <div className="text-[10px] text-[var(--green-100)] mb-3">
        Total eligible: {formatBv(eligibleBv)} &middot; Ineligible excluded: {formatBv(ineligibleBv)}
      </div>

      {/* Stacked bar with labels */}
      <div className="flex h-8 rounded-lg overflow-hidden mb-4">
        {barSegments.map((s) => {
          const abbrev = PIPELINE_ABBREV[s.stage] || s.stage;
          const label = s.pct >= 3 ? `${abbrev} ${s.pct.toFixed(1)}%` : s.pct >= 1.5 ? `${s.pct.toFixed(0)}%` : "";
          return (
            <div
              key={s.stage}
              style={{ flex: s.bv, backgroundColor: s.color }}
              className="relative flex items-center justify-center transition-all duration-200 hover:opacity-80"
              title={`${s.stage}: ${formatBv(s.bv)} (${s.pct.toFixed(1)}%)`}
            >
              {label && (
                <span className="text-[10px] font-bold text-white whitespace-nowrap px-1 drop-shadow-sm">
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend - always show all stages */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {allSegments.map((s) => (
          <span key={s.stage} className="text-[11px]">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm mr-1 align-middle"
              style={{ backgroundColor: s.color }}
            />
            <span className={`${s.bv === 0 ? "text-[var(--green-100)]/50" : "text-[var(--green-100)]"}`}>
              {s.stage}
            </span>
            <span className={`font-medium ml-1 ${s.bv === 0 ? "text-[var(--moss)]/40" : "text-[var(--moss)]"}`}>
              {formatBv(s.bv)} ({s.pct.toFixed(1)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
