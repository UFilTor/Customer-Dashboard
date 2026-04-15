import type { PayDeal } from "@/lib/types";

const HUBSPOT_BASE = "https://app.hubspot.com/contacts/26131226/deal";

const STAGE_COLORS: Record<string, string> = {
  "Unwilling": "#FCA5A5",
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

interface Props {
  deals: PayDeal[];
  eligibleBv: number;
  onDealClick: (dealName: string) => void;
}

export function PayUnwilling({ deals, eligibleBv, onDealClick }: Props) {
  if (deals.length === 0) return null;

  const totalBv = deals.reduce((sum, d) => sum + d.bv, 0);
  const pct = eligibleBv > 0 ? (totalBv / eligibleBv) * 100 : 0;

  return (
    <div className="mb-6">
      <h3 className="text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--green-100)] pb-2 mb-3 border-b-2 border-[#EDEDEA]">
        Unwilling
      </h3>
      <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4">
        <div className="inline-block bg-amber-500 text-white rounded-md px-3 py-1 text-[11px] font-bold mb-3">
          {deals.length} customers - {formatBv(totalBv)} ({pct.toFixed(1)}% of eligible BV)
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[#999] border-b border-[#EDEDEA]">
              <th className="text-left py-1">Customer</th>
              <th className="text-left py-1">Owner</th>
              <th className="text-left py-1">Stage</th>
              <th className="text-left py-1">Reason</th>
              <th className="text-right py-1 whitespace-nowrap">BV (% of {formatBv(eligibleBv)})</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.dealId} className="border-b border-[#F8F9FA] last:border-0">
                <td className="py-1.5">
                  <button
                    onClick={() => onDealClick(deal.dealName)}
                    className="text-[var(--moss)] hover:underline text-left"
                  >
                    {deal.dealName}
                  </button>
                </td>
                <td className="py-1.5 text-[var(--green-100)]">{deal.ownerName}</td>
                <td className="py-1.5 text-[var(--green-100)]">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                    style={{ backgroundColor: STAGE_COLORS["Unwilling"] }}
                  />
                  Unwilling
                </td>
                <td className="py-1.5 text-[var(--green-100)] max-w-[200px] truncate">
                  {deal.unwillingReason || "-"}
                </td>
                <td className="text-right py-1.5">{formatBvPct(deal.bv, eligibleBv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
