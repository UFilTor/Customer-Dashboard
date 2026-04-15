import type { PayOwnerSummary, PayStage } from "@/lib/types";

const STAGE_ORDER: PayStage[] = [
  "Live",
  "Verified",
  "Pending Verification",
  "Started Onboarding",
  "Signed - Not Started",
  "Not yet enrolled",
  "Unwilling",
  "Ineligible",
];

const STAGE_COLORS: Record<string, string> = {
  "Live": "#065F46",
  "Verified": "#6EE7B7",
  "Pending Verification": "#FCD34D",
  "Started Onboarding": "#FDBA74",
  "Signed - Not Started": "#93C5FD",
  "Not yet enrolled": "#D1D5DB",
  "Unwilling": "#FCA5A5",
  "Ineligible": "#9CA3AF",
};



function formatBv(value: number): string {
  if (value === 0) return "€0";
  if (value < 1000) return `€${Math.round(value)}`;
  if (value < 999500) return `€${Math.round(value / 1000)}k`;
  const m = value / 1000000;
  return `€${m % 1 === 0 ? m : m.toFixed(1)}M`;
}

interface Props {
  allOwnersSummary: PayOwnerSummary;
  owners: PayOwnerSummary[];
}

function OwnerCard({ owner }: { owner: PayOwnerSummary }) {
  return (
    <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm text-[var(--moss)]">
          {owner.ownerName}
        </span>
      </div>
      <div className="text-[10px] text-[var(--green-100)] mb-2">
        Total BV: {formatBv(owner.totalBv)} &middot; Eligible: {formatBv(owner.eligibleBv)}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-[#F3F3F3] rounded-full mb-2 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(100, owner.lcPercent)}%`,
            backgroundColor: owner.lcPercent >= 40 ? "#065F46" : "#F59E0B",
          }}
        />
      </div>

      <div className={`text-xl font-bold mb-0.5 ${owner.lcPercent >= 40 ? "text-[#065F46]" : "text-amber-600"}`}>
        {owner.lcPercent.toFixed(1)}%
      </div>
      <div className="text-[10px] text-[var(--green-100)] mb-3">
        BV live/verified (excl. ineligible)
      </div>

      {/* Stage table with percentages */}
      <div className="space-y-1">
        {STAGE_ORDER.map((stage) => {
          const data = owner.stageCounts[stage];
          const pct = stage === "Ineligible"
            ? (data.bv / (owner.totalBv || 1)) * 100
            : (data.bv / (owner.eligibleBv || 1)) * 100;
          const label = stage === "Ineligible" ? `${stage} (excl. from % calc)` : stage;
          const isEmpty = data.count === 0;
          return (
            <div key={stage} className={`flex justify-between text-xs ${isEmpty ? "opacity-40" : ""}`}>
              <span className="text-[var(--green-100)] flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: STAGE_COLORS[stage] }}
                />
                {label}
              </span>
              <span className="text-[var(--moss)] font-medium">
                {pct.toFixed(1)}% {formatBv(data.bv)}
              </span>
            </div>
          );
        })}
      </div>

      {/* ARR insight */}
      <div className="border-t border-[#EDEDEA] mt-2 pt-2 text-[10px] text-[var(--green-100)]">
        ARR live/verified: {owner.arrPercent.toFixed(1)}%
      </div>
    </div>
  );
}

export function PayOwnerOverview({ allOwnersSummary, owners }: Props) {
  return (
    <div className="mb-6">
      <h3 className="text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--green-100)] pb-2 mb-3 border-b-2 border-[#EDEDEA]">
        Overview by Owner
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <OwnerCard owner={allOwnersSummary} />
        {owners.map((owner) => (
          <OwnerCard key={owner.ownerId} owner={owner} />
        ))}
      </div>
    </div>
  );
}
