"use client";

import { useState } from "react";
import { AttentionGroup as AttentionGroupType, AttentionCompany, AttentionSignal, CompanySearchResult } from "@/lib/types";
import { sortAttentionCompanies, SortField } from "@/lib/sort-attention";
import { formatGroupDuration } from "@/lib/timeline";
import { snoozeCompany, unsnoozeCompany, getSnoozedCompanies, isCompanySnoozed } from "@/lib/snooze";
import SnoozePopover from "./SnoozePopover";

interface Props {
  group: AttentionGroupType;
  onSelectCompany: (company: CompanySearchResult, meta?: { previousCategory?: string }) => void;
  sortField?: SortField;
  onSnoozeChange?: () => void;
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

function formatSnoozeUntil(iso: string): string {
  return iso.split("T")[0];
}

function CompanyRow({
  company,
  signal,
  onClick,
  snoozePopoverOpen,
  onSnoozeIconClick,
  onSnooze,
  onSnoozeClose,
}: {
  company: AttentionCompany;
  signal: AttentionSignal;
  onClick: () => void;
  snoozePopoverOpen: boolean;
  onSnoozeIconClick: (e: React.MouseEvent) => void;
  onSnooze: (until: string) => void;
  onSnoozeClose: () => void;
}) {
  return (
    <div className="relative group/row">
      <button
        onClick={onClick}
        className="w-full bg-[var(--light-grey)] rounded-[var(--border-radius)] p-3 text-left hover:bg-[var(--lichen)]/30 transition-all duration-200"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
          <div className="flex items-center gap-2">
            {company.mrr && company.mrr !== "-" && (
              <span className="text-xs font-medium text-[var(--moss)]">{company.mrr}</span>
            )}
          </div>
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

      {/* Snooze bell icon - shown on row hover */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 relative">
        <button
          onClick={onSnoozeIconClick}
          className="opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 p-1.5 rounded-md hover:bg-[var(--beige-gray)] text-[var(--green-100)] hover:text-[var(--moss)]"
          title="Snooze"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
        <SnoozePopover
          isOpen={snoozePopoverOpen}
          onSnooze={onSnooze}
          onClose={onSnoozeClose}
        />
      </div>
    </div>
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

export function AttentionGroup({ group, onSelectCompany, sortField = "mrr", onSnoozeChange }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [snoozePopoverCompanyId, setSnoozePopoverCompanyId] = useState<string | null>(null);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(() => {
    const snoozed = getSnoozedCompanies();
    return new Set(
      snoozed
        .filter((s) => s.signal === group.signal)
        .map((s) => s.companyId)
    );
  });

  function refreshSnoozeState() {
    const snoozed = getSnoozedCompanies();
    setSnoozedIds(
      new Set(
        snoozed
          .filter((s) => s.signal === group.signal)
          .map((s) => s.companyId)
      )
    );
  }

  const isUrgent = URGENT_SIGNALS.includes(group.signal);

  const activeCompanies = group.companies.filter((c) => !snoozedIds.has(c.id));
  const snoozedCompanies = group.companies.filter((c) => snoozedIds.has(c.id));

  const displayCount = expanded ? activeCompanies.length : 5;
  const hasMore = activeCompanies.length > 5;

  // Determine effective sort field for this group type
  const effectiveSort = getEffectiveSortField(group.signal, sortField);
  const sortedActive = sortAttentionCompanies(activeCompanies, effectiveSort);

  // Get snoozeUntil date for a company
  function getSnoozeUntil(companyId: string): string | undefined {
    return getSnoozedCompanies().find(
      (s) => s.companyId === companyId && s.signal === group.signal
    )?.snoozeUntil;
  }

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
          {activeCompanies.length}
        </span>
      </div>

      <div className="space-y-2">
        {sortedActive.slice(0, displayCount).map((company) => (
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
              snoozePopoverOpen={snoozePopoverCompanyId === company.id}
              onSnoozeIconClick={(e) => {
                e.stopPropagation();
                setSnoozePopoverCompanyId(company.id);
              }}
              onSnooze={(until) => {
                snoozeCompany({
                  companyId: company.id,
                  signal: group.signal,
                  snoozeUntil: until,
                  companyName: company.name,
                });
                refreshSnoozeState();
                setSnoozePopoverCompanyId(null);
                onSnoozeChange?.();
              }}
              onSnoozeClose={() => setSnoozePopoverCompanyId(null)}
            />
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-[var(--moss)] font-semibold mt-2 hover:underline transition-all duration-200"
        >
          {expanded ? "Show less" : `Show all (${activeCompanies.length})`}
        </button>
      )}

      {/* Snoozed items section */}
      {snoozedCompanies.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowSnoozed(!showSnoozed)}
            className="text-xs text-[var(--green-100)] hover:text-[var(--moss)] font-medium transition-all duration-200"
          >
            {showSnoozed ? "Hide snoozed" : `Show snoozed (${snoozedCompanies.length})`}
          </button>

          {showSnoozed && (
            <div className="space-y-2 mt-2">
              {snoozedCompanies.map((company) => {
                const snoozeUntil = getSnoozeUntil(company.id);
                return (
                  <div
                    key={company.id}
                    className="opacity-50 bg-[var(--light-grey)] rounded-[var(--border-radius)] p-3 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
                      {snoozeUntil && (
                        <p className="text-xs text-[var(--green-100)] mt-0.5">
                          Snoozed until {formatSnoozeUntil(snoozeUntil)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        unsnoozeCompany(company.id, group.signal);
                        refreshSnoozeState();
                        onSnoozeChange?.();
                      }}
                      className="text-xs text-[var(--moss)] font-semibold hover:underline transition-all duration-200 ml-4 shrink-0"
                    >
                      Unsnooze
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
