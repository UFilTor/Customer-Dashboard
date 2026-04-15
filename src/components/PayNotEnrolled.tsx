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
  if (days > 90) return "text-[var(--rust)] font-semibold";
  if (days > 30) return "text-orange-600";
  return "text-[var(--green-100)]";
}

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

function NotEnrolledCard({ ownerName, deals, allDeals, totalEligibleBv, onDealClick }: { ownerName: string; deals: PayDeal[]; allDeals: PayDeal[]; totalEligibleBv: number; onDealClick: (dealName: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const top20 = deals.filter((d) => d.bv > 0).slice(0, 20);
  const totalNeBv = allDeals.reduce((sum, d) => sum + d.bv, 0);
  const nePct = totalEligibleBv > 0 ? (totalNeBv / totalEligibleBv) * 100 : 0;
  const shown = expanded ? top20 : top20.slice(0, 10);

  return (
    <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4">
      <h4 className="text-sm font-semibold text-[var(--moss)] mb-2">
        {ownerName}
        <span className="font-normal text-[var(--green-100)] ml-2">
          ({allDeals.length} not yet enrolled - {formatBv(totalNeBv)} / {nePct.toFixed(1)}% of eligible BV)
        </span>
      </h4>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-[#999] border-b border-[#EDEDEA]">
            <th className="text-left py-1 w-6">#</th>
            <th className="text-left py-1">Customer</th>
            <th className="text-left py-1">Last Activity</th>
            <th className="text-right py-1 whitespace-nowrap">BV (% of {formatBv(totalEligibleBv)})</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((deal, i) => (
            <tr key={deal.dealId} className="border-b border-[#F8F9FA] last:border-0">
              <td className="text-[var(--green-100)] py-1.5">{i + 1}</td>
              <td className="py-1.5">
                <button
                  onClick={() => onDealClick(deal.dealName)}
                  className="text-[var(--moss)] hover:underline text-left"
                >
                  {deal.dealName}
                </button>
                <DealFlags deal={deal} />
              </td>
              <td className={`py-1.5 ${dayColor(deal.daysSinceActivity)}`}>
                {deal.daysSinceActivity !== null ? `${deal.daysSinceActivity}d ago` : "-"}
              </td>
              <td className="text-right py-1.5">{formatBvPct(deal.bv, totalEligibleBv)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {top20.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--moss)] hover:text-[var(--green-100)] mt-2"
        >
          {expanded ? "Show top 10" : `Show all ${top20.length} deals`}
        </button>
      )}
    </div>
  );
}

export function PayNotEnrolled({ deals, owners, totalEligibleBv, onDealClick }: Props) {
  if (deals.length === 0) return null;

  // Group by owner
  const byOwner = new Map<string, { name: string; deals: PayDeal[] }>();
  for (const deal of deals) {
    const key = deal.ownerId || "unassigned";
    if (!byOwner.has(key)) byOwner.set(key, { name: deal.ownerName, deals: [] });
    byOwner.get(key)!.deals.push(deal);
  }

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
        Not Yet Enrolled - Top 20 by BV (no Pay status in HubSpot)
      </h3>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {groups.map(([ownerId, group]) => (
          <NotEnrolledCard
            key={ownerId}
            ownerName={group.name}
            deals={group.deals}
            allDeals={group.deals}
            totalEligibleBv={totalEligibleBv}
            onDealClick={onDealClick}
          />
        ))}
      </div>
    </div>
  );
}
