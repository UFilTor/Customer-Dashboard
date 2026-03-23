import { OwnerMap } from "@/lib/types";

interface Props {
  companyId: string;
  company: Record<string, string>;
  owners: OwnerMap;
}

export function CompanyHeader({ companyId, company, owners }: Props) {
  const name = company.name || "Unknown Company";
  const domain = company.domain || "";
  const ownerName = owners[company.hubspot_owner_id] || "-";
  const lastContacted = company.notes_last_contacted
    ? formatRelativeDate(company.notes_last_contacted)
    : "-";

  const portalId = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;
  const hubspotUrl = portalId
    ? `https://app.hubspot.com/contacts/${portalId}/company/${companyId}`
    : null;

  return (
    <div className="flex justify-between items-center mb-4">
      <div>
        <h1 className="text-2xl font-bold text-[var(--moss)]">{name}</h1>
        <p className="text-sm text-[var(--green-100)]">
          {domain} &middot; Owner: {ownerName} &middot; Last contacted: {lastContacted}
        </p>
      </div>
      {hubspotUrl && (
        <a
          href={hubspotUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[var(--moss)] underline hover:text-[var(--green-100)] transition-all duration-200"
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
