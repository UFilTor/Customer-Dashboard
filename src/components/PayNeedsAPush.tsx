"use client";

import { useState } from "react";
import type { PayDeal, PayOwnerSummary } from "@/lib/types";

const HUBSPOT_BASE = "https://app.hubspot.com/contacts/26131226/deal";
const ACTIVE_PUSH_STAGES = new Set(["Not yet enrolled", "Signed - Not Started", "Started Onboarding", "Pending Verification"]);

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

function dayColor(days: number | null): string {
  if (days === null) return "text-[var(--green-100)]";
  if (days > 30) return "text-[var(--rust)]";
  if (days > 14) return "text-orange-600";
  if (days > 7) return "text-amber-600";
  return "text-[var(--green-100)]";
}

const STAGE_COLORS: Record<string, string> = {
  "Signed - Not Started": "#93C5FD",
  "Started Onboarding": "#FDBA74",
  "Pending Verification": "#FCD34D",
};



function DealFlags({ deal }: { deal: PayDeal }) {
  if (!ACTIVE_PUSH_STAGES.has(deal.stage)) return null;
  return (
    <>
      {deal.hasOpenInvoice && (
        <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-[var(--rust)]/10 text-[var(--rust)] ml-1">INVOICE</span>
      )}
      {deal.zeroEvents && (
        <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-orange-100 text-orange-800 ml-1">0 EVENTS</span>
      )}
    </>
  );
}

interface Props {
  deals: PayDeal[];
  owners: PayOwnerSummary[];
  totalEligibleBv: number;
  onDealClick: (dealName: string) => void;
}

function PushCard({ ownerName, deals, totalEligibleBv, onDealClick }: { ownerName: string; deals: PayDeal[]; totalEligibleBv: number; onDealClick: (dealName: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const sorted = [...deals].sort((a, b) => b.bv - a.bv);
  const shown = expanded ? sorted : sorted.slice(0, 10);

  return (
    <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4">
      <h4 className="text-sm font-semibold text-[var(--moss)] mb-2">
        {ownerName}
        <span className="font-normal text-[var(--green-100)] ml-2">
          ({deals.length} deals stalled)
        </span>
      </h4>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-[#999] border-b border-[#EDEDEA]">
            <th className="text-left py-1">Customer</th>
            <th className="text-left py-1">Pay Stage</th>
            <th className="text-left py-1">Last Activity</th>
            <th className="text-right py-1 whitespace-nowrap">BV (% of {formatBv(totalEligibleBv)})</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((deal) => {
            const stageColor = STAGE_COLORS[deal.stage] || "#999";
            return (
              <tr key={deal.dealId} className="border-b border-[#F8F9FA] last:border-0">
                <td className="py-1.5">
                  <button
                    onClick={() => onDealClick(deal.dealName)}
                    className="text-[var(--moss)] hover:underline text-left"
                  >
                    {deal.dealName}
                  </button>
                  <DealFlags deal={deal} />
                </td>
                <td className="py-1.5 text-[var(--green-100)]">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                    style={{ backgroundColor: stageColor }}
                  />
                  {deal.stage}
                </td>
                <td className={`py-1.5 font-semibold ${dayColor(deal.daysSinceActivity)}`}>
                  {deal.daysSinceActivity !== null ? `${deal.daysSinceActivity}d ago` : "-"}
                </td>
                <td className="text-right py-1.5">{formatBvPct(deal.bv, totalEligibleBv)}</td>
              </tr>
            );
          })}
          {deals.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center py-3 text-[var(--green-100)]">No stalled deals</td>
            </tr>
          )}
        </tbody>
      </table>
      {sorted.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--moss)] hover:text-[var(--green-100)] mt-2"
        >
          {expanded ? "Show top 10" : `Show all ${sorted.length} deals`}
        </button>
      )}
    </div>
  );
}

export function PayNeedsAPush({ deals, owners, totalEligibleBv, onDealClick }: Props) {
  if (deals.length === 0) return null;

  // Group by owner
  const byOwner = new Map<string, { name: string; deals: PayDeal[] }>();
  for (const deal of deals) {
    const key = deal.ownerId || "unassigned";
    if (!byOwner.has(key)) byOwner.set(key, { name: deal.ownerName, deals: [] });
    byOwner.get(key)!.deals.push(deal);
  }

  // Sort owners by the order they appear in the owners array
  const ownerOrder = owners.map((o) => o.ownerId);
  const groups = Array.from(byOwner.entries())
    .sort((a, b) => {
      const ai = ownerOrder.indexOf(a[0]);
      const bi = ownerOrder.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  return (
    <div className="mb-6">
      <h3 className="text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--green-100)] pb-2 mb-3 border-b-2 border-[#EDEDEA]">
        Needs a Push - In Progress, No Activity 3+ Days
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {groups.map(([ownerId, group]) => (
          <PushCard
            key={ownerId}
            ownerName={group.name}
            deals={group.deals}
            totalEligibleBv={totalEligibleBv}
            onDealClick={onDealClick}
          />
        ))}
      </div>
    </div>
  );
}
