"use client";

import { useState } from "react";
import { AttentionGroup as AttentionGroupType, AttentionCompany, AttentionSignal, CompanySearchResult } from "@/lib/types";
import { sortAttentionCompanies, SortField } from "@/lib/sort-attention";

interface Props {
  group: AttentionGroupType;
  onSelectCompany: (company: CompanySearchResult, meta?: { previousCategory?: string }) => void;
  sortField?: SortField;
}

const URGENT_SIGNALS: AttentionSignal[] = ["overdue_invoices", "overdue_tasks"];

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function CompanyRow({ company, signal, onClick }: { company: AttentionCompany; signal: AttentionSignal; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-[var(--light-grey)] rounded-[var(--border-radius)] p-3 text-left hover:bg-[var(--lichen)]/30 transition-all duration-200"
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
        {company.mrr && company.mrr !== "-" && (
          <span className="text-xs font-medium text-[var(--moss)]">{company.mrr}</span>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {signal === "overdue_invoices" && (
          <span className="text-xs text-[var(--green-100)]">{company.detail}</span>
        )}
        {signal === "overdue_tasks" && (
          <>
            <span className="text-xs text-[var(--green-100)]">{company.detail}</span>
            {company.daysOverdue !== undefined && (
              <span className="text-xs font-medium text-[var(--rust)]">{company.daysOverdue}d overdue</span>
            )}
          </>
        )}
        {signal === "health_score" && (
          <>
            <span className={`text-xs font-medium ${company.detail === "Critical Churn Risk" ? "text-[var(--rust)]" : "text-orange-600"}`}>
              {company.detail}
            </span>
            {company.previousCategory && (
              <span className="text-xs text-[var(--green-100)]">
                was {company.previousCategory}
              </span>
            )}
            {company.categoryChangedAt && (
              <span className="text-xs text-[var(--green-100)]">
                changed {formatRelativeDate(company.categoryChangedAt)}
              </span>
            )}
          </>
        )}
        {signal === "gone_quiet" && (
          <span className="text-xs text-[var(--green-100)]">
            {company.daysSilent !== undefined ? `Silent for ${company.daysSilent} days` : company.detail}
          </span>
        )}
      </div>
    </button>
  );
}

// Maps a global sort choice to the appropriate field for each group type
function getEffectiveSortField(signal: AttentionSignal, globalSort: SortField): SortField {
  if (globalSort === "mrr") return "mrr";
  // "urgency" sort maps to the relevant time-based field per group
  if (signal === "overdue_invoices" || signal === "overdue_tasks") return "daysOverdue";
  if (signal === "gone_quiet") return "daysSilent";
  // health_score has no time field, always sort by MRR
  return "mrr";
}

export function AttentionGroup({ group, onSelectCompany, sortField = "mrr" }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isUrgent = URGENT_SIGNALS.includes(group.signal);
  const displayCount = expanded ? group.companies.length : 5;
  const hasMore = group.companies.length > 5;

  // Determine effective sort field for this group type
  const effectiveSort = getEffectiveSortField(group.signal, sortField);
  const sortedCompanies = sortAttentionCompanies(group.companies, effectiveSort);

  return (
    <div className="mb-6" data-attention-group={group.signal}>
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-semibold text-[var(--moss)]">{group.label}</h3>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isUrgent
              ? "bg-[var(--rust)] text-white"
              : "bg-[var(--beige)] text-[var(--moss)]"
          }`}
        >
          {group.companies.length}
        </span>
      </div>

      <div className="space-y-2">
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
