"use client";

import { OwnerMap } from "@/lib/types";
import HealthBadge from "./HealthBadge";

interface Props {
  companyId: string;
  company: Record<string, string>;
  deal: Record<string, string> | null;
  owners: OwnerMap;
  onBack?: () => void;
  showBack?: boolean;
  previousCategory?: string;
}

export function CompanyHeader({ companyId, company, deal, owners, onBack, showBack, previousCategory }: Props) {
  const name = company.name || "Unknown Company";
  const domain = company.domain || "";
  const ownerName = owners[company.hubspot_owner_id] || "-";
  const lastContacted = company.notes_last_contacted
    ? formatRelativeDate(company.notes_last_contacted)
    : "-";
  const storefrontLink = deal?.["Storefront link"] || "";

  const portalId = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;
  const hubspotUrl = portalId
    ? `https://app.hubspot.com/contacts/${portalId}/company/${companyId}`
    : null;

  return (
    <div className="flex justify-between items-start mb-4">
      <div className="flex items-start gap-3">
        {showBack && (
          <button
            onClick={onBack}
            aria-label="Back to overview"
            className="w-8 h-8 flex items-center justify-center rounded-[8px] border border-gray-200 bg-white hover:bg-[#F8F6ED] transition-colors duration-150 shrink-0 mt-0.5"
          >
            <span className="text-[var(--moss)] text-base leading-none">←</span>
          </button>
        )}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--moss)]">{name}</h1>
            {company["Health Score Category"] && (
              <HealthBadge
                category={company["Health Score Category"]}
                previousCategory={previousCategory}
              />
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-sm text-[var(--green-100)]">
            {domain && (
              <>
                <a
                  href={`https://${domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--moss)] underline hover:text-[var(--green-100)] transition-all duration-200"
                >
                  {domain}
                </a>
                <span>&middot;</span>
              </>
            )}
            {storefrontLink && (
              <>
                <a
                  href={storefrontLink.startsWith("http") ? storefrontLink : `https://${storefrontLink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--moss)] underline hover:text-[var(--green-100)] transition-all duration-200"
                >
                  Booking page
                </a>
                <span>&middot;</span>
              </>
            )}
            <span>Owner: {ownerName}</span>
            <span>&middot;</span>
            <span>Last contacted: {lastContacted}</span>
          </div>
        </div>
      </div>
      {hubspotUrl && (
        <a
          href={hubspotUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--moss)] underline hover:text-[var(--green-100)] transition-all duration-200 shrink-0"
        >
          Open in HubSpot
        </a>
      )}
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toISOString().split("T")[0];
}
