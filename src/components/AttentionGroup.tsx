"use client";

import { useState, useRef } from "react";
import { AttentionGroup as AttentionGroupType, AttentionCompany, AttentionSignal, CompanySearchResult } from "@/lib/types";
import { sortAttentionCompanies, SortField } from "@/lib/sort-attention";
import { formatGroupDuration } from "@/lib/timeline";
import { snoozeCompany, unsnoozeCompany, getSnoozedCompanies, isCompanySnoozed } from "@/lib/snooze";
import SnoozePopover from "./SnoozePopover";
import CompanyTooltip from "./CompanyTooltip";
import { MetricChips } from "./MetricChips";
import { getHealthLabel } from "@/lib/health-score";

interface Props {
  group: AttentionGroupType;
  onSelectCompany: (company: CompanySearchResult, meta?: { previousCategory?: string }) => void;
  sortField?: SortField;
  onSnoozeChange?: () => void;
}

const URGENT_SIGNALS: AttentionSignal[] = ["overdue_invoices", "open_invoices", "overdue_tasks"];

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
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeout = useRef<NodeJS.Timeout | null>(null);

  return (
    <div
      className="relative group/row"
      onMouseEnter={() => {
        tooltipTimeout.current = setTimeout(() => setShowTooltip(true), 300);
      }}
      onMouseLeave={() => {
        if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
        setShowTooltip(false);
      }}
    >
      <button
        onClick={() => {
          setShowTooltip(false);
          if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
          onClick();
        }}
        className="w-full border-b border-[#F0EEE8] p-3 pr-10 text-left hover:bg-[#FAFAF7] transition-all duration-150"
      >
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
          <div className="flex items-center gap-2">
            <MetricChips
              healthScore={company.healthScore}
              volume12m={company.volume12m}
              volume3m={company.volume3m}
              volume6m={company.volume6m}
              payStatus={company.payStatus}
            />
            {company.mrr && company.mrr !== "-" && (
              <span className="text-xs font-medium text-[var(--moss)]">{company.mrr}</span>
            )}
          </div>
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
          {signal === "gone_quiet" && (
            <span className="text-xs text-[var(--green-100)]">
              {company.daysSilent !== undefined ? `Silent for ${company.daysSilent} days` : company.detail}
            </span>
          )}
          {signal === "declining_volume" && (
            <span className="text-xs text-[var(--rust)]">{company.detail}</span>
          )}
          {signal === "churn_risk" && (
            <span className="text-xs text-[var(--rust)]">{company.detail}</span>
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

      {/* Snooze bell icon - absolutely positioned inside the row */}
      <button
        onClick={onSnoozeIconClick}
        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 p-1.5 rounded-md hover:bg-[#F0EEE8] text-[#BBB] hover:text-[var(--moss)]"
        title="Snooze"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </button>
      {snoozePopoverOpen && (
        <SnoozePopover
          isOpen={snoozePopoverOpen}
          onSnooze={onSnooze}
          onClose={onSnoozeClose}
        />
      )}
      {showTooltip && <CompanyTooltip company={company} />}
    </div>
  );
}

// Maps a global sort choice to the appropriate field for each group type
function getEffectiveSortField(signal: AttentionSignal, globalSort: SortField): SortField {
  if (globalSort === "mrr") return "mrr";
  // "urgency" sort maps to the relevant time-based field per group
  if (signal === "overdue_invoices" || signal === "open_invoices" || signal === "overdue_tasks") return "daysOverdue";
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
          {activeCompanies.length}
        </span>
      </div>

      <div style={{ overflow: "visible" }}>
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
            <div className="mt-2">
              {snoozedCompanies.map((company) => {
                const snoozeUntil = getSnoozeUntil(company.id);
                return (
                  <div
                    key={company.id}
                    className="opacity-50 border-b border-[#F0EEE8] p-3 flex items-center justify-between"
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
