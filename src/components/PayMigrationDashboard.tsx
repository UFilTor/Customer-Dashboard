"use client";

import { useState, useEffect } from "react";
import type { PayMigrationData, CompanySearchResult } from "@/lib/types";
import { SkeletonPayMigration } from "./Skeleton";
import { PayStatCards } from "./PayStatCards";
import { PayPipelineChart } from "./PayPipelineChart";
import { PayOwnerOverview } from "./PayOwnerOverview";
import { PayPathToTarget } from "./PayPathToTarget";
import { PayNeedsAPush } from "./PayNeedsAPush";
import { PayUnwilling } from "./PayUnwilling";
import { PayNotEnrolled } from "./PayNotEnrolled";

const KEY_OWNER_IDS = new Set(["962517007", "559364799"]); // Anders, Cecilia

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

interface Props {
  onSelectCompany: (company: CompanySearchResult) => void;
}

export function PayMigrationDashboard({ onSelectCompany }: Props) {
  const [data, setData] = useState<PayMigrationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<"key" | "all">("key");

  async function handleDealClick(dealName: string) {
    try {
      const res = await fetch(`/api/companies/search?q=${encodeURIComponent(dealName)}`);
      if (!res.ok) return;
      const results: CompanySearchResult[] = await res.json();
      if (results.length > 0) {
        onSelectCompany(results[0]);
      }
    } catch { /* ignore */ }
  }

  async function fetchData(refresh = false) {
    setIsLoading(true);
    setError(null);
    try {
      const url = refresh ? "/api/pay-migration?refresh=true" : "/api/pay-migration";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Could not load Pay Migration data. Try refreshing.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, []);

  if (isLoading && !data) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--moss)]">Pay Migration</h2>
        </div>
        <SkeletonPayMigration />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--moss)]">Pay Migration</h2>
        </div>
        <div className="border border-[var(--rust)]/20 bg-[var(--rust)]/5 rounded-[var(--border-radius)] p-4 text-center">
          <p className="text-sm text-[var(--rust)]">{error}</p>
          <button
            onClick={() => fetchData(true)}
            className="mt-2 text-xs text-[var(--moss)] underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const filteredOwners = ownerFilter === "key"
    ? data.owners.filter((o) => KEY_OWNER_IDS.has(o.ownerId))
    : data.owners;

  const filteredOwnerIds = new Set(filteredOwners.map((o) => o.ownerId));
  const filterDeals = (deals: typeof data.needsAPush) =>
    ownerFilter === "key" ? deals.filter((d) => filteredOwnerIds.has(d.ownerId)) : deals;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-[var(--moss)]">Pay Migration</h2>
          <div className="text-xs text-[var(--green-100)]">
            {data.allDeals.length} deals tracked
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Owner filter toggle */}
          <div className="flex items-center bg-[#F7F7F5] rounded-[10px] p-0.5">
            <button
              onClick={() => setOwnerFilter("key")}
              className={`px-3 py-1 rounded-[8px] text-xs font-medium transition-all duration-200 ${
                ownerFilter === "key"
                  ? "bg-[var(--moss)] text-white"
                  : "text-[var(--green-100)] hover:text-[var(--moss)]"
              }`}
            >
              Key owners
            </button>
            <button
              onClick={() => setOwnerFilter("all")}
              className={`px-3 py-1 rounded-[8px] text-xs font-medium transition-all duration-200 ${
                ownerFilter === "all"
                  ? "bg-[var(--moss)] text-white"
                  : "text-[var(--green-100)] hover:text-[var(--moss)]"
              }`}
            >
              All owners
            </button>
          </div>
          {data.updatedAt && (
            <span className="text-xs text-[var(--green-100)]">
              Updated {timeAgo(data.updatedAt)}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={isLoading}
            className="text-xs text-[var(--moss)] hover:text-[var(--green-100)] transition-colors disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <PayStatCards data={data} />
      <PayPipelineChart
        stageBreakdown={data.stageBreakdown}
        eligibleBv={data.eligibleBv}
        ineligibleBv={data.ineligibleBv}
      />
      <PayOwnerOverview
        allOwnersSummary={data.allOwnersSummary}
        owners={filteredOwners}
      />
      <PayPathToTarget
        owners={filteredOwners}
        targetPercent={data.aprilTarget}
        totalEligibleBv={data.eligibleBv}
        onDealClick={handleDealClick}
      />
      <PayNeedsAPush
        deals={filterDeals(data.needsAPush)}
        owners={filteredOwners}
        totalEligibleBv={data.eligibleBv}
        onDealClick={handleDealClick}
      />
      <PayUnwilling deals={data.unwilling} eligibleBv={data.eligibleBv} onDealClick={handleDealClick} />
      <PayNotEnrolled
        deals={filterDeals(data.notEnrolled)}
        owners={filteredOwners}
        totalEligibleBv={data.eligibleBv}
        onDealClick={handleDealClick}
      />
    </div>
  );
}
