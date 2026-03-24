"use client";

import { useState } from "react";
import { Engagement, OwnerMap } from "@/lib/types";
import ActivityFilters from "./ActivityFilters";
import { filterEngagements, ActivityFilterState } from "@/lib/filter-activities";

interface Props {
  engagements: Engagement[];
  owners: OwnerMap;
}

const TYPE_COLORS: Record<string, string> = {
  call: "bg-[#CFE8FF] text-[#1E40AF]",
  meeting: "bg-[#D1BEE7] text-[#581C87]",
  note: "bg-[#F0ECE0] text-[#78716C]",
  email: "bg-[#D5DFCA] text-[#022C12]",
};

function ActivityCard({ engagement, owners }: { engagement: Engagement; owners: OwnerMap }) {
  const [expanded, setExpanded] = useState(false);
  const bodyText = stripHtml(engagement.body || "");
  const hasSummary = engagement.summary && engagement.summary.length > 0;
  const hasBody = bodyText.length > 0;

  return (
    <div className="border-b border-[#F0EEE8] py-3.5 pl-4 border-l-[3px] border-l-transparent" data-tab-item>
      <div className="flex items-start gap-3">
        <span
          className={`inline-block px-2 py-1 rounded-[8px] text-xs font-medium capitalize shrink-0 ${
            TYPE_COLORS[engagement.type] || "bg-[var(--grey)] text-[var(--moss)]"
          }`}
        >
          {engagement.type}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <h4 className="font-medium text-[var(--moss)] text-sm truncate">
              {engagement.title}
            </h4>
            <span className="text-xs text-[var(--green-100)] whitespace-nowrap ml-2">
              {formatTimestamp(engagement.timestamp)}
            </span>
          </div>

          <div className="flex gap-3 mt-1 text-xs text-[var(--green-100)]">
            {engagement.direction && (
              <span>{engagement.direction === "INBOUND" || engagement.direction === "INCOMING" ? "Inbound" : "Outbound"}</span>
            )}
            {engagement.outcome && <span>Outcome: {engagement.outcome}</span>}
            {engagement.status && <span>Status: {engagement.status}</span>}
            {engagement.owner && <span>By: {owners[engagement.owner] || engagement.owner}</span>}
            {engagement.fromEmail && <span>From: {engagement.fromEmail}</span>}
            {engagement.toEmail && <span>To: {engagement.toEmail}</span>}
          </div>

          {hasSummary && (
            <p className="text-sm text-[var(--dark-moss)] mt-2 leading-relaxed">
              {engagement.summary}
            </p>
          )}

          {!hasSummary && hasBody && (
            <p className="text-sm text-[var(--dark-moss)] mt-2 leading-relaxed line-clamp-3">
              {bodyText}
            </p>
          )}

          {hasBody && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-[var(--moss)] font-semibold mt-2 hover:underline transition-all duration-200"
            >
              {expanded ? "Hide full content" : "Show full content"}
            </button>
          )}

          {expanded && hasBody && (
            <div className="mt-2 pt-2 border-t border-[var(--beige-gray)] animate-fadeIn">
              <p className="text-sm text-[var(--dark-moss)] leading-relaxed whitespace-pre-wrap">
                {bodyText}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ActivityTab({ engagements, owners }: Props) {
  const [filters, setFilters] = useState<ActivityFilterState>({ types: null, daysBack: 90 });

  const filteredEngagements = filterEngagements(engagements, filters);

  if (engagements.length === 0) {
    return <p className="text-[var(--green-100)] text-sm py-4">No activity in the last 90 days</p>;
  }

  return (
    <div>
      <ActivityFilters onFilterChange={setFilters} />
      <p className="text-xs text-[var(--green-100)] mb-3">
        Showing {filteredEngagements.length} {filteredEngagements.length === 1 ? "activity" : "activities"}
      </p>
      {filteredEngagements.length === 0 ? (
        <div className="text-center py-8 flex flex-col items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2 text-[var(--green-100)] opacity-60">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <p className="text-[var(--green-100)] text-sm">No activities match the current filters</p>
        </div>
      ) : (
        <div>
          {filteredEngagements.map((engagement, index) => (
            <ActivityCard
              key={`${engagement.type}-${engagement.timestamp}-${index}`}
              engagement={engagement}
              owners={owners}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatTimestamp(ts: string): string {
  const date = new Date(parseInt(ts) || ts);
  if (isNaN(date.getTime())) return ts;
  return date.toLocaleDateString("sv-SE");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
