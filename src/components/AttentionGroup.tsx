"use client";

import { useState } from "react";
import { AttentionGroup as AttentionGroupType, AttentionSignal, CompanySearchResult } from "@/lib/types";

interface Props {
  group: AttentionGroupType;
  onSelectCompany: (company: CompanySearchResult) => void;
}

const URGENT_SIGNALS: AttentionSignal[] = ["overdue_invoices", "overdue_tasks"];

export function AttentionGroup({ group, onSelectCompany }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isUrgent = URGENT_SIGNALS.includes(group.signal);
  const displayCount = expanded ? group.companies.length : 5;
  const hasMore = group.companies.length > 5;

  return (
    <div className="mb-6">
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
        {group.companies.slice(0, displayCount).map((company) => (
          <button
            key={company.id}
            onClick={() => onSelectCompany({ id: company.id, name: company.name, domain: "" })}
            className="w-full bg-[var(--light-grey)] rounded-[var(--border-radius)] p-3 flex items-center justify-between text-left hover:bg-[var(--lichen)]/30 transition-all duration-200"
          >
            <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
            <span className="text-xs text-[var(--green-100)]">{company.detail}</span>
          </button>
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
