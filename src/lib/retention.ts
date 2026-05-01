import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import {
  fetchAssociations,
  fetchHistoryForDeals,
  fetchObjectsBatch,
  fetchOwnerNames,
  fetchUpcomingMeetingsByOwners,
  MEETING_PROPS,
} from "./onboarding";
import { computeWatchOutSignals } from "./signals";
import type {
  OnboardingCommercial,
  OnboardingMeeting,
  RetentionDeal,
  RetentionInvoiceState,
  RetentionMeetingEntry,
  WatchOutSignal,
} from "./types";

// Customer Retention pipeline. Same constant lives in onboarding.ts (where it
// is treated as "downstream of onboarding") and attention.ts (where it's the
// scope for churn-risk signals). Keep them in sync.
export const RETENTION_PIPELINE = "1072518362";

// Stages we treat as "live customer in retention scope". Adopted/Started
// overlap with onboarding stage names but are scoped here to the retention
// pipeline — pipeline membership is the discriminator.
export const RETENTION_STAGES = new Set([
  "Adopted",
  "Started",
  "Ramp Up",
  "Established",
]);

// EUR conversion table — kept in sync with src/lib/pay-migration.ts. Only
// covers the currencies the CS team actually transacts in. Add new ones as
// the platform expands.
const TO_EUR: Record<string, number> = {
  EUR: 1,
  SEK: 0.087,
  DKK: 0.134,
  NOK: 0.085,
  GBP: 1.18,
  USD: 0.92,
};

function toEur(amount: number, currency: string | undefined): number {
  const rate = TO_EUR[(currency || "EUR").toUpperCase()] ?? 1;
  return amount * rate;
}

/** True when a deal record (HubSpot raw properties) is in retention scope. */
export function isRetentionDeal(props: { pipeline?: string; customer_stage?: string }): boolean {
  if (props.pipeline !== RETENTION_PIPELINE) return false;
  return RETENTION_STAGES.has(props.customer_stage || "");
}

/** Extract the deal's invoice state for the brief's Commercial section. */
export function extractInvoiceState(
  props: Record<string, string>,
  nowIso: string
): RetentionInvoiceState {
  const open = parseInt(props.number_of_open_invoices || "0", 10) || 0;
  const unpaid = props.unpaid_invoice === "true";
  const dueIso = props.invoice_due_date || "";
  const outstandingRaw = parseFloat(props.outstanding_amount || "0") || 0;
  const currency = props.deal_currency_code;

  let overdue = 0;
  let overdueDays: number | null = null;
  if (unpaid && dueIso) {
    const due = new Date(dueIso).getTime();
    const now = new Date(nowIso).getTime();
    if (!isNaN(due) && due < now) {
      overdue = 1;
      overdueDays = Math.floor((now - due) / (24 * 60 * 60 * 1000));
    }
  }

  const outstandingEur =
    outstandingRaw > 0 ? Math.round(toEur(outstandingRaw, currency)) : null;

  return { open, overdue, overdueDays, outstandingEur };
}

/** Days between `nowIso` and `iso`, or null when the input is missing/invalid. */
export function daysSinceIso(nowIso: string, iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const now = new Date(nowIso).getTime();
  return Math.floor((now - t) / (24 * 60 * 60 * 1000));
}

interface BuildOptions {
  ownerIds?: string[];
  meetingFromIso?: string;          // override default 5-workday window
  meetingToIso?: string;
}

interface RetentionPayloadOnly {
  deals: RetentionDeal[];
  meetings: RetentionMeetingEntry[];
}

const RETENTION_DEAL_PROPS = [
  "dealname",
  "pipeline",
  "dealstage",
  "customer_stage",
  "customer_substage",
  "createdate",
  "customer_live_date",
  "deal_currency_code",
  "subscription_plan",
  "hubspot_owner_id",
  // Commercial
  "booking_fee",
  "confirmed_booking_fee",
  "core_net_price__local_currency",
  "amount_in_home_currency",
  "test_billing_start_date",
  // Invoice
  "number_of_open_invoices",
  "unpaid_invoice",
  "invoice_due_date",
  "outstanding_amount",
  // Watch-outs
  "wish_to_churn",
  "churn_reason",
  "notes_last_contacted",
  // Storefront
  "storefront",
];

const COMPANY_PROPS_FOR_RETENTION = [
  "name",
  "domain",
  "hubspot_owner_id",
  "notes_last_contacted",
  "understory_company_country",
  "understory_booking_volume_all_time",
  "understory_booking_volume_1m",
  "understory_booking_volume_2m",
  "understory_booking_volume_3m",
  "understory_booking_volume_6m",
  "understory_booking_volume_12m",
  "health_score",
  "understory_health_score_actual_acv",
  "understory_health_score_customer_storefront_visits",
  "understory_health_score_customer_widget_visits",
  "understory_health_score_features_enabled",
  "understory_health_score_login_last_month",
  "understory_health_score_transactions_diff",
  "understory_health_score_upcoming_events",
];

/**
 * Build the bulk Retention payload: every retention-pipeline deal that
 * matches the owner filter, plus the meetings logged on those deals
 * inside the requested window (defaults to the next 5 work days).
 */
export async function buildRetentionPayload(
  opts: BuildOptions = {}
): Promise<RetentionPayloadOnly> {
  const ownerIds = opts.ownerIds;
  const nowIso = new Date().toISOString();

  // 1. Search retention deals (paginated with sorts clause to avoid silent
  // truncation — see AGENTS.md "HubSpot fetch patterns").
  const deals = await searchRetentionDeals({ ownerIds, properties: RETENTION_DEAL_PROPS });

  // 2. Companies for those deals — fetch via batch associations + then batch-
  // read company properties (faster than /companies/search per AGENTS.md).
  const dealIdToCompanyId = await fetchDealToCompany(deals.map((d) => d.id));
  const companyIds = Array.from(new Set(Array.from(dealIdToCompanyId.values())));
  const companyProps = companyIds.length > 0
    ? await fetchObjectsBatch("companies", companyIds, COMPANY_PROPS_FOR_RETENTION)
    : new Map<string, Record<string, string>>();

  // dealId → company props
  const companyMap = new Map<string, Record<string, string>>();
  for (const [dealId, companyId] of dealIdToCompanyId.entries()) {
    const props = companyProps.get(companyId);
    if (props) companyMap.set(dealId, props);
  }

  // 3. Resolve owner names so we can populate ownerName on each deal.
  const ownerNameMap = await fetchOwnerNames(
    Array.from(new Set(deals.map((d) => d.properties?.hubspot_owner_id || "").filter(Boolean)))
  );

  // 4. Meetings — same window logic as onboarding. Default = today through
  // end of 5th workday. Caller can override with meetingFromIso/meetingToIso.
  const fromIso = opts.meetingFromIso ?? nowIso;
  const toIso = opts.meetingToIso ?? endOfNthWorkDayIso(new Date(), 5);

  // CS owner scope for the meeting fetch — when the caller doesn't restrict,
  // use the CS owner directory we already have via the deals' owners. This
  // mirrors onboarding's behavior: only pull calendars for owners whose
  // accounts are in scope.
  const csOwnerIds = ownerIds && ownerIds.length > 0
    ? ownerIds
    : Array.from(new Set(deals.map((d) => d.properties?.hubspot_owner_id || "").filter(Boolean)));

  const ownerMeetings = csOwnerIds.length > 0
    ? await fetchUpcomingMeetingsByOwners(csOwnerIds, fromIso, toIso)
    : [];

  // 5. Resolve which retention deal each meeting belongs to. Walk
  // meetings → deals associations and pick the first hit that's in our
  // retention deal set.
  const meetingToDeal = await resolveDealsForMeetings(
    ownerMeetings.map((m) => m.id),
    new Set(deals.map((d) => d.id))
  );

  // 6. Build RetentionDeal[] from the raw deals + companies. Compute watch-
  // outs while we have all the inputs in hand.
  const retentionDeals: RetentionDeal[] = deals.map((d) =>
    buildRetentionDeal(d, companyMap, ownerNameMap, dealIdToCompanyId, nowIso)
  );
  const dealById = new Map(retentionDeals.map((d) => [d.dealId, d]));

  // 7. Build the meeting entries (only meetings that resolved to a retention deal).
  // Convert the raw HubSpot meeting payload into our OnboardingMeeting shape
  // and pair it with the retention deal.
  const meetingOwnerIds = new Set<string>();
  for (const m of ownerMeetings) {
    if (m.properties?.hubspot_owner_id) meetingOwnerIds.add(m.properties.hubspot_owner_id);
  }
  const meetingOwnerNames = await fetchOwnerNames(Array.from(meetingOwnerIds));

  const meetingEntries: RetentionMeetingEntry[] = [];
  for (const raw of ownerMeetings) {
    const dealId = meetingToDeal.get(raw.id);
    if (!dealId) continue;
    const deal = dealById.get(dealId);
    if (!deal) continue;
    const startsAt = raw.properties?.hs_meeting_start_time;
    if (!startsAt) continue;
    const ownerId = raw.properties?.hubspot_owner_id || "";
    const meeting: OnboardingMeeting = {
      id: raw.id,
      title: (raw.properties?.hs_meeting_title || "(Untitled meeting)").trim() || "(Untitled meeting)",
      startsAt,
      endsAt: raw.properties?.hs_meeting_end_time || null,
      body: raw.properties?.hs_meeting_body || null,
      internalNotes: raw.properties?.hs_internal_meeting_notes || null,
      outcome: raw.properties?.hs_meeting_outcome || null,
      activityType: raw.properties?.hs_activity_type || null,
      ownerId,
      ownerName: ownerId ? (meetingOwnerNames[ownerId] ?? null) : null,
    };
    meetingEntries.push({ meeting, deal });
  }
  meetingEntries.sort((a, b) => a.meeting.startsAt.localeCompare(b.meeting.startsAt));

  return { deals: retentionDeals, meetings: meetingEntries };
}

// Helper: Search retention-pipeline deals with the owner filter. Always sends
// a sorts clause to keep pagination working (see AGENTS.md). Retries 429/5xx.
async function searchRetentionDeals(opts: {
  ownerIds: string[] | undefined;
  properties: string[];
}): Promise<Array<{ id: string; properties: Record<string, string> }>> {
  const baseFilters: unknown[] = [
    { propertyName: "pipeline", operator: "EQ", value: RETENTION_PIPELINE },
    { propertyName: "customer_stage", operator: "IN", values: [...RETENTION_STAGES] },
  ];
  const filters: unknown[] =
    opts.ownerIds && opts.ownerIds.length > 0
      ? [...baseFilters, { propertyName: "hubspot_owner_id", operator: "IN", values: opts.ownerIds }]
      : baseFilters;
  const filterGroups = [{ filters }];

  const results: Array<{ id: string; properties: Record<string, string> }> = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const body: Record<string, unknown> = {
      filterGroups,
      properties: opts.properties,
      limit: 100,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
    };
    if (after) body.after = after;
    const res = await retryFetch(async () =>
      fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
        method: "POST",
        headers: hubspotHeaders(),
        body: JSON.stringify(body),
        cache: "no-store",
      })
    );
    if (!res.ok) break;
    const json = await res.json();
    if (Array.isArray(json.results)) results.push(...json.results);
    after = json.paging?.next?.after;
    if (!after) break;
  }
  return results;
}

// Helper: small retry wrapper for transient HubSpot 429/5xx errors. Throws
// on persistent failure rather than returning ok:false silently.
async function retryFetch(do_fetch: () => Promise<Response>): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await do_fetch();
      if (res.ok) return res;
      if (res.status !== 429 && res.status < 500) return res;
      last = res;
    } catch {
      // network error — retry
    }
    await new Promise((r) => setTimeout(r, 200 * (i + 1)));
  }
  return last ?? Promise.reject(new Error("HubSpot fetch failed"));
}

// Helper: Batch-fetch the dealId -> companyId map via associations API.
async function fetchDealToCompany(dealIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (dealIds.length === 0) return out;
  const assocs = await fetchAssociations("deals", "companies", dealIds);
  for (const a of assocs) {
    if (a.toIds[0]) out.set(a.fromId, a.toIds[0]);
  }
  return out;
}

// Helper: Resolve a list of meeting IDs to their associated retention deal,
// returning Map<meetingId, dealId>. Walks meetings→deals and picks the first
// match against `allowedDealIds`. Mirrors the onboarding orphan-meeting flow's
// "which deal does this meeting belong to" question, narrowed to retention.
async function resolveDealsForMeetings(
  meetingIds: string[],
  allowedDealIds: Set<string>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (meetingIds.length === 0) return out;
  const assocs = await fetchAssociations("meetings", "deals", meetingIds);
  for (const a of assocs) {
    for (const dealId of a.toIds) {
      if (allowedDealIds.has(dealId)) {
        out.set(a.fromId, dealId);
        break;
      }
    }
  }
  return out;
}

// Helper: end-of-day timestamp for the Nth work day starting from today.
// Mirrors onboarding's endOfNthWorkDay but returns ISO. Inline rather than
// re-export from onboarding.ts to keep retention.ts self-sufficient.
function endOfNthWorkDayIso(start: Date, n: number): string {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  let counted = 0;
  if (cursor.getDay() !== 0 && cursor.getDay() !== 6) counted = 1;
  while (counted < n) {
    cursor.setDate(cursor.getDate() + 1);
    const wd = cursor.getDay();
    if (wd !== 0 && wd !== 6) counted++;
  }
  cursor.setHours(23, 59, 59, 999);
  return cursor.toISOString();
}

// Compose a RetentionDeal from raw HubSpot deal + matching company props.
function buildRetentionDeal(
  rawDeal: { id: string; properties: Record<string, string> },
  companyMap: Map<string, Record<string, string>>,
  ownerNameMap: Record<string, string>,
  dealIdToCompanyId: Map<string, string>,
  nowIso: string
): RetentionDeal {
  const dp = rawDeal.properties || {};
  const cp = companyMap.get(rawDeal.id) || {};
  const liveDate = dp.customer_live_date || null;

  // Commercial — pull the same way onboarding does.
  const commercial: OnboardingCommercial = {
    monthlyFee: formatMonthlyFee(dp.core_net_price__local_currency, dp.deal_currency_code),
    acv: formatAcv(dp.amount_in_home_currency),
    bookingFee: formatBookingFee(dp.booking_fee, dp.confirmed_booking_fee),
    firstBilling: formatFirstBilling(dp.test_billing_start_date),
    salesOwner: null,    // resolved at the API layer where we have the owner directory; null here
  };

  const invoices = extractInvoiceState(dp, nowIso);
  const futureEvents = parseUpcomingEvents(cp.understory_health_score_upcoming_events);

  const watchOuts: WatchOutSignal[] = computeWatchOutSignals({
    nowIso,
    unpaidInvoice: dp.unpaid_invoice === "true",
    invoiceDueDate: dp.invoice_due_date || null,
    outstandingEur: invoices.outstandingEur,
    overdueDays: invoices.overdueDays,
    wishToChurn: dp.wish_to_churn === "true",
    churnReason: dp.churn_reason || null,
    volume3m: parseFloat(cp.understory_booking_volume_3m || "0") || 0,
    volume6m: parseFloat(cp.understory_booking_volume_6m || "0") || 0,
    healthScore: parseFloat(cp.health_score || "") || null,
    upcomingEvents: futureEvents,
    notesLastContacted: cp.notes_last_contacted || dp.notes_last_contacted || null,
    daysInStep: null,
    expectedDaysInStep: null,
  });

  const ownerId = dp.hubspot_owner_id || "";
  const ownerName = ownerId ? (ownerNameMap[ownerId] || "Unassigned") : "Unassigned";

  return {
    dealId: rawDeal.id,
    companyId: dealIdToCompanyId.get(rawDeal.id) ?? null,
    companyName: cp.name || dp.dealname || "(unknown)",
    ownerId,
    ownerName,
    country: cp.understory_company_country || null,
    customerStage: dp.customer_stage || "",
    customerSubstage: dp.customer_substage || null,
    liveDate,
    daysLive: daysSinceIso(nowIso, liveDate),
    contactName: null,               // resolved at API layer (contact association)
    contactEmail: null,
    contactPhone: null,
    companyDomain: cp.domain || null,
    storefrontLink: dp.storefront || null,
    commercial,
    invoices,
    futureEvents,
    companyProps: cp,
    history: [],                     // backfilled by /api/retention/history
    watchOuts,
    lastTouch: cp.notes_last_contacted || null,
  };
}

function parseUpcomingEvents(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

// Inline formatters — clones of the onboarding ones. Kept here so retention.ts
// is self-sufficient and we don't bloat onboarding.ts's export surface.

function formatBookingFee(bookingFee: string | undefined, confirmedBookingFee: string | undefined): string | null {
  const raw = confirmedBookingFee || bookingFee;
  if (!raw) return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  const pct = n < 1 ? n * 100 : n;
  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function formatMonthlyFee(amount: string | undefined, currency: string | undefined): string | null {
  if (!amount) return null;
  const n = parseFloat(amount);
  if (isNaN(n) || n === 0 || !currency?.trim()) return null;
  return `${Math.round(n).toLocaleString("en-US")} ${currency.trim().toUpperCase()}/mo`;
}

function formatAcv(amount: string | undefined): string | null {
  if (!amount) return null;
  const n = parseFloat(amount);
  if (isNaN(n) || n === 0) return null;
  return `${Math.round(n).toLocaleString("en-US")} EUR`;
}

function formatFirstBilling(date: string | undefined): string | null {
  if (!date) return null;
  const trimmed = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

// Re-export the lazy history fetcher under a retention-flavored name for
// route-handler clarity. It's the same primitive — both dashboards share
// engagements per deal.
export const fetchRetentionHistoryForDeals = fetchHistoryForDeals;

// Suppress unused-import warning for MEETING_PROPS — we don't currently need
// it because we always go through `fetchUpcomingMeetingsByOwners` which uses
// it internally. Keep it imported to make the relationship visible.
void MEETING_PROPS;
