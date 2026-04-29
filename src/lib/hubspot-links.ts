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
