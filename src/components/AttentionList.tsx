"use client";

import { useState, useEffect } from "react";
import { AttentionGroup as AttentionGroupComponent } from "./AttentionGroup";
import { AttentionResponse, CompanySearchResult } from "@/lib/types";
import type { SortField } from "@/lib/sort-attention";
import { isCompanySnoozed } from "@/lib/snooze";

interface Props {
  onSelectCompany: (company: CompanySearchResult, meta?: { previousCategory?: string }) => void;
  currentOwnerId?: string;
}

export function AttentionList({ onSelectCompany, currentOwnerId }: Props) {
  const [data, setData] = useState<AttentionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMine, setShowMine] = useState(true);
  const [sortField, setSortField] = useState<SortField>("mrr");
  const [snoozeVersion, setSnoozeVersion] = useState(0);

  async function fetchAttention(refresh = false) {
    setIsLoading(true);
    setError(null);
    try {
      const url = refresh ? "/api/attention?refresh=true" : "/api/attention";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Could not load attention data. Try refreshing.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchAttention();
  }, []);

  function formatUpdatedAt(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Updated just now";
    if (minutes === 1) return "Updated 1 minute ago";
    return `Updated ${minutes} minutes ago`;
  }

  if (isLoading) {
    return <SkeletonAttentionInline />;
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--rust)] text-sm mb-2">{error}</p>
        <button
          onClick={() => fetchAttention(true)}
          className="text-sm text-[var(--moss)] font-semibold hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--moss)] text-lg font-medium">All clear</p>
        <p className="text-[var(--green-100)] text-sm mt-1">No customers need immediate attention.</p>
      </div>
    );
  }

  // snoozeVersion is read here to make the computed values reactive when snooze state changes
  void snoozeVersion;

  const shouldFilter = showMine && currentOwnerId;
  const ownerFilteredGroups = shouldFilter
    ? data.groups
        .map((g) => ({
          ...g,
          companies: g.companies.filter((c) => c.ownerId === currentOwnerId),
        }))
        .filter((g) => g.companies.length > 0)
    : data.groups;

  // Compute active (non-snoozed) counts for summary tiles
  const filteredGroups = ownerFilteredGroups.map((g) => ({
    ...g,
    activeCount: g.companies.filter((c) => !isCompanySnoozed(c.id, g.signal)).length,
  }));

  const totalCompanies = filteredGroups.reduce((sum, g) => sum + g.activeCount, 0);
  const signalCounts = filteredGroups.map((g) => ({ label: g.label, count: g.activeCount, signal: g.signal }));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--moss)]">Needs Attention</h2>
          <p className="text-xs text-[var(--green-100)] mt-1">
            {formatUpdatedAt(data.updatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {currentOwnerId && (
            <div className="flex items-center bg-[var(--light-grey)] rounded-[var(--border-radius)] p-1">
              <button
                onClick={() => setShowMine(true)}
                className={`px-3 py-1 rounded-[8px] text-xs font-medium transition-all duration-200 ${
                  showMine
                    ? "bg-[var(--moss)] text-white"
                    : "text-[var(--green-100)] hover:text-[var(--moss)]"
                }`}
              >
                My accounts
              </button>
              <button
                onClick={() => setShowMine(false)}
                className={`px-3 py-1 rounded-[8px] text-xs font-medium transition-all duration-200 ${
                  !showMine
                    ? "bg-[var(--moss)] text-white"
                    : "text-[var(--green-100)] hover:text-[var(--moss)]"
                }`}
              >
                All accounts
              </button>
            </div>
          )}
          <div className="flex items-center bg-[var(--light-grey)] rounded-[var(--border-radius)] p-1">
            <span className="text-xs text-gray-400 px-2">Sort:</span>
            <button
              onClick={() => setSortField("mrr")}
              className={`px-3 py-1 rounded-[8px] text-xs font-medium transition-all duration-200 ${
                sortField === "mrr"
                  ? "bg-[var(--moss)] text-white"
                  : "text-[var(--green-100)] hover:text-[var(--moss)]"
              }`}
            >
              MRR
            </button>
            <button
              onClick={() => setSortField("daysOverdue")}
              className={`px-3 py-1 rounded-[8px] text-xs font-medium transition-all duration-200 ${
                sortField !== "mrr"
                  ? "bg-[var(--moss)] text-white"
                  : "text-[var(--green-100)] hover:text-[var(--moss)]"
              }`}
            >
              Urgency
            </button>
          </div>
          <button
            onClick={() => fetchAttention(true)}
            className="text-sm text-[var(--moss)] hover:text-[var(--green-100)] transition-all duration-200"
            title="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: `repeat(${signalCounts.length + 1}, minmax(0, 1fr))` }}>
        <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4">
          <div className="text-[var(--green-100)] text-xs uppercase tracking-wide mb-1">Total</div>
          <div className="text-xl font-bold text-[var(--moss)]">{totalCompanies}</div>
        </div>
        {signalCounts.map((s) => {
          const isUrgent = s.signal === "overdue_invoices" || s.signal === "overdue_tasks";
          return (
            <div key={s.signal} className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4">
              <div className="text-[var(--green-100)] text-xs uppercase tracking-wide mb-1">{s.label}</div>
              <div className={`text-xl font-bold ${isUrgent && s.count > 0 ? "text-[var(--rust)]" : "text-[var(--moss)]"}`}>
                {s.count}
              </div>
            </div>
          );
        })}
      </div>

      {ownerFilteredGroups.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-[var(--moss)] text-lg font-medium">All clear</p>
          <p className="text-[var(--green-100)] text-sm mt-1">No accounts need your immediate attention.</p>
        </div>
      ) : (
        ownerFilteredGroups.map((group) => (
          <AttentionGroupComponent
            key={group.signal}
            group={group}
            onSelectCompany={onSelectCompany}
            sortField={sortField}
            onSnoozeChange={() => setSnoozeVersion((v) => v + 1)}
          />
        ))
      )}
    </div>
  );
}

function SkeletonAttentionInline() {
  return (
    <div className="animate-pulse">
      <div className="h-6 w-40 bg-[var(--beige-gray)] rounded mb-2" />
      <div className="h-3 w-32 bg-[var(--beige-gray)] rounded mb-6" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-6">
          <div className="h-5 w-36 bg-[var(--beige-gray)] rounded mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-12 bg-[var(--light-grey)] rounded-[var(--border-radius)]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
