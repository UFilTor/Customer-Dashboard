import type { PayOwnerSummary, PayDeal } from "@/lib/types";

const LIVE_STAGES = new Set(["Verified", "Live"]);
const EXCLUDE_STAGES = new Set(["Ineligible", "Unwilling"]);
const HUBSPOT_BASE = "https://app.hubspot.com/contacts/26131226/deal";
type DealClickHandler = (dealName: string) => void;

const STAGE_COLORS: Record<string, string> = {
  "Live": "#065F46",
  "Verified": "#6EE7B7",
  "Pending Verification": "#FCD34D",
  "Started Onboarding": "#FDBA74",
  "Signed - Not Started": "#93C5FD",
  "Not yet enrolled": "#D1D5DB",
};



function formatBv(value: number): string {
  if (value === 0) return "€0";
  if (value < 1000) return `€${Math.round(value)}`;
  if (value < 999500) return `€${Math.round(value / 1000)}k`;
  const m = value / 1000000;
  return `€${m % 1 === 0 ? m : m.toFixed(1)}M`;
}

function formatBvPct(bv: number, total: number): string {
  const pct = total > 0 ? (bv / total * 100).toFixed(1) : "0.0";
  return `${formatBv(bv)} (${pct}%)`;
}

function DealFlags({ deal }: { deal: PayDeal }) {
  const activePush = ["Not yet enrolled", "Signed - Not Started", "Started Onboarding", "Pending Verification"].includes(deal.stage);
  return (
    <>
      {activePush && deal.hasOpenInvoice && (
        <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-[var(--rust)]/10 text-[var(--rust)]">INVOICE</span>
      )}
      {activePush && deal.zeroEvents && (
        <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-orange-100 text-orange-800">0 EVENTS</span>
      )}
    </>
  );
}

interface Props {
  owners: PayOwnerSummary[];
  targetPercent: number;
  totalEligibleBv: number;
  onDealClick: DealClickHandler;
}

function PathCard({ owner, targetPercent, totalEligibleBv, onDealClick }: { owner: PayOwnerSummary; targetPercent: number; totalEligibleBv: number; onDealClick: DealClickHandler }) {
  const eligDenom = owner.eligibleBv;
  const curPct = owner.lcPercent;
  const barFill = Math.min(curPct / 50 * 100, 100);
  const markerPos = Math.min(targetPercent / 50 * 100, 100);

  // Live deals first, then pipeline deals
  const liveDeals = owner.deals
    .filter((d) => LIVE_STAGES.has(d.stage) && d.bv > 0)
    .sort((a, b) => b.bv - a.bv);
  const pipeDeals = owner.deals
    .filter((d) => !LIVE_STAGES.has(d.stage) && !EXCLUDE_STAGES.has(d.stage) && d.bv > 0)
    .sort((a, b) => b.bv - a.bv);

  const ordered = [...liveDeals, ...pipeDeals];

  // Build rows with running totals, stop at 50%
  let runningBv = 0;
  let pastTargetMarked = false;
  const rows: { deal: PayDeal; row: number; runningPct: number; pp: number; isLive: boolean; isTargetRow: boolean; isSeparator?: boolean }[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const d = ordered[i];
    const isLive = LIVE_STAGES.has(d.stage);

    // Insert separator between live and pipeline
    if (!isLive && rows.length > 0 && rows[rows.length - 1].isLive) {
      rows.push({ deal: d, row: -1, runningPct: 0, pp: 0, isLive: false, isTargetRow: false, isSeparator: true });
    }

    runningBv += d.bv;
    const runPct = eligDenom > 0 ? (runningBv / eligDenom) * 100 : 0;
    const pp = eligDenom > 0 ? (d.bv / eligDenom) * 100 : 0;
    let isTargetRow = false;
    if (!pastTargetMarked && runPct >= targetPercent) {
      pastTargetMarked = true;
      isTargetRow = true;
    }

    rows.push({ deal: d, row: rows.filter((r) => !r.isSeparator).length + 1, runningPct: runPct, pp, isLive, isTargetRow });

    if (runPct >= 50) break;
  }

  const shown = rows;

  return (
    <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4">
      <h4 className="text-sm font-semibold text-[var(--moss)] mb-2">{owner.ownerName}</h4>

      {/* Progress bar with target marker */}
      <div className="relative h-2 bg-[#F3F3F3] rounded-full mb-1.5">
        <div
          className="absolute h-full rounded-full"
          style={{ width: `${barFill}%`, backgroundColor: "var(--moss)" }}
        />
        <div
          className="absolute -top-1 w-0.5 h-4"
          style={{ left: `${markerPos}%`, backgroundColor: "#F59E0B" }}
        />
      </div>
      <div className="flex justify-between text-[10px] mb-3">
        <span className="text-[var(--moss)] font-semibold">{curPct.toFixed(1)}% current</span>
        <span className="text-amber-600 font-semibold">{targetPercent}% target</span>
      </div>

      {/* Deal table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[#999] border-b border-[#EDEDEA]">
              <th className="text-left py-1 pr-1 w-6">#</th>
              <th className="text-left py-1">Customer</th>
              <th className="text-left py-1">Pay Stage</th>
              <th className="text-right py-1 whitespace-nowrap">BV (% of {formatBv(totalEligibleBv)})</th>
              <th className="text-right py-1">+PP</th>
              <th className="text-right py-1">Running</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              if (r.isSeparator) {
                return (
                  <tr key={`sep-${i}`}>
                    <td colSpan={6} className="text-[10px] text-[var(--green-100)] py-1.5 bg-[#F9F9F6] border-b border-[#EDEDEA]">
                      &#9660; Pipeline needed to reach {targetPercent}%
                    </td>
                  </tr>
                );
              }
              const stageColor = STAGE_COLORS[r.deal.stage] || "#999";
              return (
                <tr
                  key={r.deal.dealId}
                  className={
                    r.isLive ? "bg-[#f0faf5]" :
                    r.isTargetRow ? "border-l-2 border-l-amber-500 bg-amber-50/50 font-semibold" : ""
                  }
                >
                  <td className="text-[var(--green-100)] py-1 pr-1">{r.row}</td>
                  <td className="py-1">
                    <button
                      onClick={() => onDealClick(r.deal.dealName)}
                      className="text-[var(--moss)] hover:underline text-left"
                    >
                      {r.deal.dealName}
                    </button>
                    <DealFlags deal={r.deal} />
                  </td>
                  <td className="py-1 text-[var(--green-100)]">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                      style={{ backgroundColor: stageColor }}
                    />
                    {r.deal.stage}
                  </td>
                  <td className="text-right py-1">{formatBvPct(r.deal.bv, totalEligibleBv)}</td>
                  <td className="text-right py-1 text-[var(--green-100)]">+{r.pp.toFixed(1)}pp</td>
                  <td className="text-right py-1 font-semibold">{r.runningPct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}

export function PayPathToTarget({ owners, targetPercent, totalEligibleBv, onDealClick }: Props) {
  const belowTarget = owners.filter((o) => o.eligibleBv > 0);
  if (belowTarget.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--green-100)] pb-2 mb-3 border-b-2 border-[#EDEDEA]">
        Path to {targetPercent}% by Owner
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {belowTarget.map((owner) => (
          <PathCard
            key={owner.ownerId}
            owner={owner}
            targetPercent={targetPercent}
            totalEligibleBv={totalEligibleBv}
            onDealClick={onDealClick}
          />
        ))}
      </div>
    </div>
  );
}
