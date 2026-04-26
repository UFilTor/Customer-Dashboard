"use client";

import { useState } from "react";
import { AttentionGroup as AttentionGroupType, AttentionCompany, AttentionSignal, CompanySearchResult } from "@/lib/types";
import { sortAttentionCompanies, SortField } from "@/lib/sort-attention";
import { formatGroupDuration } from "@/lib/timeline";
import { MetricChips } from "./MetricChips";
import { getHealthLabel } from "@/lib/health-score";

interface Props {
  group: AttentionGroupType;
  onSelectCompany: (company: CompanySearchResult, meta?: { previousCategory?: string }) => void;
  sortField?: SortField;
}

const URGENT_SIGNALS: AttentionSignal[] = ["overdue_invoices", "open_invoices"];

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function CompanyRow({
  company,
  signal,
  onClick,
}: {
  company: AttentionCompany;
  signal: AttentionSignal;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full border-b border-[#F0EEE8] p-3 text-left hover:bg-[#FAFAF7] transition-all duration-150"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
        <MetricChips
          revenue={company.revenue}
          healthScore={company.healthScore}
          volume12m={company.volume12m}
          volume3m={company.volume3m}
          volume6m={company.volume6m}
          payStatus={company.payStatus}
        />
      </div>
      <div className="flex items-center gap-2 mt-1">
        {(signal === "overdue_invoices" || signal === "open_invoices") && (
          <>
            <span className="text-xs text-[var(--green-100)]">{company.detail}</span>
            {company.daysOverdue !== undefined && (
              <span className="text-xs font-medium text-[var(--rust)]">{company.daysOverdue}d overdue</span>
            )}
          </>
        )}
        {signal === "health_score" && (
          <>
            {company.previousCategory && (
              <span className="text-xs text-[var(--green-100)]">
                was {getHealthLabel(company.previousCategory)} ({Math.round(parseFloat(company.previousCategory))})
              </span>
            )}
            {company.categoryChangedAt && (
              <span className="text-xs text-[var(--green-100)]">
                changed {formatRelativeDate(company.categoryChangedAt)}
              </span>
            )}
          </>
        )}
        {signal === "no_future_events" && (
          <span className="text-xs text-[var(--green-100)]">{company.detail}</span>
        )}
        {(() => {
          const duration = formatGroupDuration(company.enteredGroupAt);
          if (!duration) return null;
          return (
            <span className="text-[11px] text-[var(--green-100)]/60 border-l border-[var(--beige-gray)] pl-2 ml-1">
              {duration}
            </span>
          );
        })()}
      </div>
    </button>
  );
}

// Maps a global sort choice to the appropriate field for each group type
function getEffectiveSortField(signal: AttentionSignal, globalSort: SortField): SortField {
  if (globalSort === "mrr") return "mrr";
  // "urgency" sort maps to the relevant time-based field per group
  if (signal === "overdue_invoices" || signal === "open_invoices") return "daysOverdue";
  return "mrr";
}

export function AttentionGroup({ group, onSelectCompany, sortField = "mrr" }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isUrgent = URGENT_SIGNALS.includes(group.signal);

  const displayCount = expanded ? group.companies.length : 5;
  const hasMore = group.companies.length > 5;

  const effectiveSort = getEffectiveSortField(group.signal, sortField);
  const sortedCompanies = sortAttentionCompanies(group.companies, effectiveSort);

  return (
    <div className="mb-2 mt-6 first:mt-0" data-attention-group={group.signal}>
      <div className="flex items-center gap-2 pb-2 mb-0 bg-[#F9F9F6] py-2.5 border-y border-[#EDEDEA] pl-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#888]">{group.label}</h3>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isUrgent
              ? "bg-[var(--rust)] text-white"
              : "bg-[var(--moss)] text-white"
          }`}
        >
          {group.companies.length}
        </span>
      </div>

      <div style={{ overflow: "visible" }}>
        {sortedCompanies.slice(0, displayCount).map((company) => (
          <div
            key={company.id}
            data-attention-item
            data-company-id={company.id}
            data-company-name={company.name}
          >
            <CompanyRow
              company={company}
              signal={group.signal}
              onClick={() => onSelectCompany({ id: company.id, name: company.name, domain: "" }, { previousCategory: company.previousCategory })}
            />
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-[var(--moss)] font-semibold mt-2 hover:underline transition-all duration-200"
        >
          {expanded ? "Show less" : `Show all (${group.companies.length})`}
        </button>
      )}
    </div>
  );
}
