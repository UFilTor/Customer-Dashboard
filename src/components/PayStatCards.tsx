import type { PayMigrationData } from "@/lib/types";

interface Props {
  data: PayMigrationData;
}

function formatBv(value: number): string {
  if (value === 0) return "€0";
  if (value < 1000) return `€${Math.round(value)}`;
  if (value < 999500) return `€${Math.round(value / 1000)}k`;
  const m = value / 1000000;
  return `€${m % 1 === 0 ? m : m.toFixed(1)}M`;
}

function statusColor(value: number, target: number): { bg: string; text: string; labelColor: string } {
  if (value >= target) return { bg: "bg-[#D1FAE5]", text: "text-[#065F46]", labelColor: "text-[#065F46]/70" };
  if (value >= target * 0.75) return { bg: "bg-amber-50", text: "text-amber-800", labelColor: "text-amber-600" };
  return { bg: "border border-[#EDEDEA]", text: "text-[var(--moss)]", labelColor: "text-[var(--green-100)]" };
}

export function PayStatCards({ data }: Props) {
  const gapApril = Math.max(0, data.aprilTarget - data.bvLiveVerifiedPercent);
  const gapMay = Math.max(0, data.mayTarget - data.bvLiveVerifiedPercent);

  const cards = [
    {
      label: "BV Live/Verified",
      value: `${data.bvLiveVerifiedPercent.toFixed(1)}%`,
      sub: `${formatBv(data.liveVerifiedBv)} of ${formatBv(data.eligibleBv)} eligible`,
      ...statusColor(data.bvLiveVerifiedPercent, data.aprilTarget),
    },
    {
      label: "BV In Progress",
      value: `${data.bvInProgressPercent.toFixed(1)}%`,
      sub: `${formatBv(data.inProgressBv)} of ${formatBv(data.eligibleBv)} eligible`,
      bg: "border border-[#EDEDEA]",
      text: "text-[var(--moss)]",
      labelColor: "text-[var(--green-100)]",
    },
    {
      label: "ARR Live/Verified",
      value: `${data.arrLiveVerifiedPercent.toFixed(1)}%`,
      sub: `${formatBv(data.liveVerifiedAcv)} of ${formatBv(data.totalAcv)} eligible`,
      bg: "border border-[#EDEDEA]",
      text: "text-[var(--moss)]",
      labelColor: "text-[var(--green-100)]",
    },
    {
      label: "April Target",
      value: `${data.aprilTarget}%`,
      sub: gapApril > 0 ? `${gapApril.toFixed(1)}pp to go` : "Target reached",
      ...statusColor(data.bvLiveVerifiedPercent, data.aprilTarget),
    },
    {
      label: "May Target",
      value: `${data.mayTarget}%`,
      sub: gapMay > 0 ? `${gapMay.toFixed(1)}pp to go` : "Target reached",
      ...statusColor(data.bvLiveVerifiedPercent, data.mayTarget),
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`${card.bg} rounded-[var(--border-radius)] p-3 text-center`}
          >
            <div className={`${card.labelColor} text-xs uppercase tracking-wide mb-1`}>
              {card.label}
            </div>
            <div className={`text-lg font-bold ${card.text}`}>{card.value}</div>
            {card.sub && (
              <div className="text-xs text-[var(--green-100)] mt-0.5">{card.sub}</div>
            )}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-[var(--green-100)] mb-6 flex flex-wrap gap-x-4 gap-y-1">
        <span>Ineligible BV excluded from target denominator</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[var(--rust)]/10 text-[var(--rust)]">INVOICE</span>
        <span className="text-[10px] text-[var(--green-100)]">open invoice in HubSpot</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-800">0 EVENTS</span>
        <span className="text-[10px] text-[var(--green-100)]">no upcoming events</span>
      </div>
    </div>
  );
}
