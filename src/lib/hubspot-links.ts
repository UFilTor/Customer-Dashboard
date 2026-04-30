// Helpers for the various "Open in HubSpot" deep-links scattered across
// the dashboard. Centralized so we get consistent UTM tagging — Filip's
// HubSpot reports can then attribute traffic from this dashboard.

const PORTAL =
  typeof process !== "undefined" ? process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID : undefined;

const UTM = "utm_source=cs-dashboard&utm_medium=app";

export function hubspotCompanyUrl(companyId: string | null | undefined): string | null {
  if (!companyId || !PORTAL) return null;
  return `https://app.hubspot.com/contacts/${PORTAL}/record/0-2/${companyId}?${UTM}`;
}

export function hubspotDealUrl(dealId: string | null | undefined): string | null {
  if (!dealId || !PORTAL) return null;
  return `https://app.hubspot.com/contacts/${PORTAL}/record/0-3/${dealId}?${UTM}`;
}

// HubSpot's engagement object-type IDs follow a predictable shape on the
// /record/ URL path. Note 0-46, Meeting 0-47, Call 0-48, Email 0-49.
const ENGAGEMENT_OBJECT_IDS = {
  note: "0-46",
  meeting: "0-47",
  call: "0-48",
  email: "0-49",
} as const;

export function hubspotEngagementUrl(
  kind: "note" | "meeting" | "call" | "email",
  id: string | null | undefined
): string | null {
  if (!id || !PORTAL) return null;
  return `https://app.hubspot.com/contacts/${PORTAL}/record/${ENGAGEMENT_OBJECT_IDS[kind]}/${id}?${UTM}`;
}
