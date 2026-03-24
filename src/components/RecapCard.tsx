import { Recap, ActionType } from "@/lib/types";

interface Props {
  recap: Recap | null;
  companyId: string;
}

const ACTION_LABELS: Record<ActionType, string> = {
  note: "Log note in HubSpot",
  task: "Create task in HubSpot",
  meeting: "Schedule meeting in HubSpot",
  call: "Log call in HubSpot",
};

const ACTION_HASHES: Record<ActionType, string> = {
  note: "#activity",
  task: "#tasks",
  meeting: "#meetings",
  call: "#activity",
};

export function RecapCard({ recap, companyId }: Props) {
  const portalId = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;

  if (recap === null) {
    return (
      <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 mb-4">
        <p className="text-[var(--green-100)] text-sm">No recent activity to summarize.</p>
      </div>
    );
  }

  if (recap.error) {
    return (
      <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 mb-4">
        <p className="text-[var(--green-100)] text-sm">
          Could not generate summary. Check the Activity tab for recent interactions.
        </p>
      </div>
    );
  }

  const hubspotUrl = portalId && recap.suggestedAction
    ? `https://app.hubspot.com/contacts/${portalId}/company/${companyId}${ACTION_HASHES[recap.suggestedAction.type]}`
    : null;

  return (
    <div className="border border-[#EDEDEA] rounded-[var(--border-radius)] p-4 mb-4">
      <span className="text-xs text-[var(--green-100)] uppercase tracking-wide">AI Summary</span>
      <p className="text-sm text-[var(--dark-moss)] mt-2 leading-relaxed">
        {recap.summary}
      </p>

      {recap.suggestedAction && (
        <>
          <div className="border-t border-[#EDEDEA] my-3" />
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--moss)] font-medium flex-1">
              {recap.suggestedAction.text}
            </p>
            {hubspotUrl && (
              <a
                href={hubspotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 bg-[var(--citrus)] text-[var(--moss)] px-4 py-2 rounded-[8px] text-sm font-semibold hover:bg-[var(--lichen)] transition-all duration-200 inline-flex items-center gap-1"
              >
                {ACTION_LABELS[recap.suggestedAction.type]}
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
