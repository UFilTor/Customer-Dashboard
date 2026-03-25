import { getHealthLabel, getHealthColor } from "@/lib/health-score";
import { abbreviateEur, computeVolumeTrend } from "@/lib/format";

interface Props {
  revenue?: number;
  healthScore?: string;
  volume12m?: number;
  volume3m?: number;
  volume6m?: number;
  payStatus?: string;
}

export function MetricChips({ revenue, healthScore, volume12m, volume3m, volume6m, payStatus }: Props) {
  const trend = computeVolumeTrend(volume3m, volume6m);

  return (
    <div className="flex items-center gap-[5px] flex-wrap">
      <RevenueChip value={revenue} />
      <HealthChip score={healthScore} />
      <VolumeChip value={volume12m} />
      {trend && <TrendChip trend={trend} />}
      <PayChip status={payStatus} />
    </div>
  );
}

function RevenueChip({ value }: { value?: number }) {
  return (
    <span title="Revenue (last 12 months)" className="inline-flex items-center text-[10.5px] font-semibold px-[7px] py-[2px] rounded-md bg-[var(--moss)]/10 text-[var(--moss)] whitespace-nowrap">
      {abbreviateEur(value)}
    </span>
  );
}

function HealthChip({ score }: { score?: string }) {
  if (!score) {
    return (
      <span title="Health score" className="inline-flex items-center gap-1 text-[10.5px] font-medium px-[7px] py-[2px] rounded-md bg-[#F3F2ED] text-[var(--green-100)] whitespace-nowrap">
        No score
      </span>
    );
  }
  const label = getHealthLabel(score);
  const colors = getHealthColor(score);
  const num = Math.round(parseFloat(score));

  return (
    <span
      title="Health score"
      className="inline-flex items-center gap-1 text-[10.5px] font-medium px-[7px] py-[2px] rounded-md whitespace-nowrap"
      style={{ background: colors.bg, color: colors.text }}
    >
      <span
        className="w-[6px] h-[6px] rounded-full shrink-0"
        style={{ background: colors.text }}
      />
      {label} ({num})
    </span>
  );
}

function VolumeChip({ value }: { value?: number }) {
  return (
    <span title="Booking volume (12 months)" className="inline-flex items-center text-[10.5px] font-medium px-[7px] py-[2px] rounded-md bg-[#F3F2ED] text-[var(--green-100)] whitespace-nowrap">
      {abbreviateEur(value)}
    </span>
  );
}

function TrendChip({ trend }: { trend: { direction: "up" | "down" | "flat"; percent: number } }) {
  const arrow = trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "↔";

  let chipClass = "bg-[#F3F2ED] text-[var(--green-100)]";
  if (trend.direction === "up") chipClass = "bg-[#D1FAE5] text-[#065F46]";
  if (trend.direction === "down") chipClass = "bg-[rgba(192,57,43,0.1)] text-[var(--rust)]";

  return (
    <span title="Volume trend (3m vs previous 3m)" className={`inline-flex items-center text-[10.5px] font-medium px-[7px] py-[2px] rounded-md whitespace-nowrap ${chipClass}`}>
      {arrow} {trend.percent}%
    </span>
  );
}

function PayChip({ status }: { status?: string }) {
  const isActive = status?.toLowerCase() === "active";
  if (isActive) {
    return (
      <span title="Understory Pay status" className="inline-flex items-center gap-1 text-[10.5px] font-medium px-[7px] py-[2px] rounded-md bg-[#D1FAE5] text-[#065F46] whitespace-nowrap">
        <span className="w-[6px] h-[6px] rounded-full shrink-0 bg-[#065F46]" />
        Pay
      </span>
    );
  }
  return (
    <span title="Understory Pay status" className="inline-flex items-center gap-1 text-[10.5px] font-medium px-[7px] py-[2px] rounded-md bg-[rgba(192,57,43,0.1)] text-[var(--rust)] whitespace-nowrap">
      <span className="w-[6px] h-[6px] rounded-full shrink-0 bg-[var(--rust)]" />
      No Pay
    </span>
  );
}
