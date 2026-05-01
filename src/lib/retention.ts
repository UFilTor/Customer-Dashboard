import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import {
  fetchAssociations,
  fetchHistoryForDeals,
  fetchObjectsBatch,
  fetchOwnerNames,
  fetchPrimaryContactsForDeals,
  fetchSalesDealsForCompanies,
  fetchUpcomingMeetingsByOwners,
  pickSalesFallback,
  type ContactInfo,
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

// Pipeline membership is the only retention scope discriminator. The same
// lifecycle deal moves from the onboarding pipeline (166333631) to this
// pipeline as the customer progresses, so any deal here is a live or
// post-live customer regardless of `customer_stage`.

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
export function isRetentionDeal(props: { pipeline?: string } & Record<string, unknown>): boolean {
  return props.pipeline === RETENTION_PIPELINE;
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
  const dealIds = deals.map((d) => d.id);

  // 2. Meeting window setup. Needed early so the calendar fetch can run in
  // parallel with the company/contact/sales-deal block below.
  const fromIso = opts.meetingFromIso ?? nowIso;
  const toIso = opts.meetingToIso ?? endOfNthWorkDayIso(new Date(), 5);

  // CS owner scope for the meeting fetch. When the caller doesn't restrict,
  // use the deals' owners. Mirrors onboarding's behavior: only pull calendars
  // for owners whose accounts are in scope.
  const csOwnerIds = ownerIds && ownerIds.length > 0
    ? ownerIds
    : Array.from(new Set(deals.map((d) => d.properties?.hubspot_owner_id || "").filter(Boolean)));

  // 3. Fire the independent fetches concurrently. The sales-deals fetch
  // depends on companyMap, so chain it off the companies promise (same
  // pattern as buildOnboardingPayload). This overlaps with the rest of the
  // block instead of waiting on it.
  const dealToCompanyPromise = fetchDealToCompany(dealIds);
  const companyMapPromise = dealToCompanyPromise.then(async (dealIdToCompanyId) => {
    const companyIds = Array.from(new Set(Array.from(dealIdToCompanyId.values())));
    const companyProps = companyIds.length > 0
      ? await fetchObjectsBatch("companies", companyIds, COMPANY_PROPS_FOR_RETENTION)
      : new Map<string, Record<string, string>>();
    // dealId → company props (lookup shape used by buildRetentionDeal)
    const byDeal = new Map<string, Record<string, string>>();
    for (const [dealId, companyId] of dealIdToCompanyId.entries()) {
      const props = companyProps.get(companyId);
      if (props) byDeal.set(dealId, props);
    }
    return { dealIdToCompanyId, companyIds, byDeal };
  });
  const contactsPromise = dealIds.length > 0
    ? fetchPrimaryContactsForDeals(dealIds)
    : Promise.resolve(new Map<string, ContactInfo>());
  const salesDealsPromise = companyMapPromise.then(({ companyIds }) =>
    fetchSalesDealsForCompanies(companyIds)
  );
  const ownerMeetingsPromise = csOwnerIds.length > 0
    ? fetchUpcomingMeetingsByOwners(csOwnerIds, fromIso, toIso)
    : Promise.resolve([] as Awaited<ReturnType<typeof fetchUpcomingMeetingsByOwners>>);

  const [companyData, contactMap, salesDealsByCompany, ownerMeetings] = await Promise.all([
    companyMapPromise,
    contactsPromise,
    salesDealsPromise,
    ownerMeetingsPromise,
  ]);
  const { dealIdToCompanyId, byDeal: companyMap } = companyData;


  // 4. Pick the sales fallback per company so each retention deal can attribute
  // a sales owner. Falls back to "missing" later when no sales deal exists.
  const salesFallbackByCompany = new Map<string, { ownerId: string }>();
  for (const [companyId, list] of salesDealsByCompany) {
    const fallback = pickSalesFallback(list);
    const sownerId = fallback?.deal.properties.hubspot_owner_id;
    if (sownerId) salesFallbackByCompany.set(companyId, { ownerId: sownerId });
  }

  // 5. Resolve owner names for the union of retention-deal owners and sales-
  // deal owners. fetchOwnerNames is request-cached, so this is cheap even when
  // the deals/meetings fetches called it earlier.
  const retentionOwnerIds = deals
    .map((d) => d.properties?.hubspot_owner_id || "")
    .filter(Boolean);
  const salesOwnerIds: string[] = [];
  for (const list of salesDealsByCompany.values()) {
    for (const d of list) {
      if (d.properties.hubspot_owner_id) salesOwnerIds.push(d.properties.hubspot_owner_id);
    }
  }
  const ownerNameMap = await fetchOwnerNames(
    Array.from(new Set([...retentionOwnerIds, ...salesOwnerIds]))
  );

  // 6. Resolve which retention deal each meeting belongs to. Walk
  // meetings → deals associations and pick the first hit that's in our
  // retention deal set.
  const meetingToDeal = await resolveDealsForMeetings(
    ownerMeetings.map((m) => m.id),
    new Set(dealIds)
  );

  // 7. Build RetentionDeal[] from the raw deals + companies. Compute watch-
  // outs while we have all the inputs in hand.
  const retentionDeals: RetentionDeal[] = deals.map((d) =>
    buildRetentionDeal(
      d,
      companyMap,
      ownerNameMap,
      dealIdToCompanyId,
      contactMap,
      salesFallbackByCompany,
      nowIso
    )
  );
  const dealById = new Map(retentionDeals.map((d) => [d.dealId, d]));

  // 8. Build the meeting entries (only meetings that resolved to a retention deal).
  // Convert the raw HubSpot meeting payload into our OnboardingMeeting shape
  // and pair it with the retention deal. Owner names already in ownerNameMap
  // for any meeting owner who also owns a retention deal; backfill any that
  // are not yet covered (request cache makes this cheap).
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
  ];
  const filters: unknown[] =
    opts.ownerIds && opts.ownerIds.length > 0
      ? [...baseFilters, { propertyName: "hubspot_owner_id", operator: "IN", values: opts.ownerIds }]
      : baseFilters;
  const filterGroups = [{ filters }];

  // Page cap of 50 = up to 5000 retention deals. The full pool is in the
  // low thousands today; the cap is just a safety net to catch a runaway
  // pagination loop. If we ever hit it, lift it and reconsider.
  const results: Array<{ id: string; properties: Record<string, string> }> = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
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
// returning Map<meetingId, dealId>. Walks deals -> meetings (the direction
// HubSpot reliably indexes; the inverse lookup returns empty even when the
// association exists). Restricts to `meetingIds` so we don't pay for meetings
// outside the calendar window the caller already fetched.
async function resolveDealsForMeetings(
  meetingIds: string[],
  allowedDealIds: Set<string>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (meetingIds.length === 0 || allowedDealIds.size === 0) return out;
  const wanted = new Set(meetingIds);
  const assocs = await fetchAssociations("deals", "meetings", Array.from(allowedDealIds));
  for (const a of assocs) {
    if (!allowedDealIds.has(a.fromId)) continue;
    for (const meetingId of a.toIds) {
      if (wanted.has(meetingId) && !out.has(meetingId)) {
        out.set(meetingId, a.fromId);
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
  contactMap: Map<string, ContactInfo>,
  salesFallbackByCompany: Map<string, { ownerId: string }>,
  nowIso: string
): RetentionDeal {
  const dp = rawDeal.properties || {};
  const cp = companyMap.get(rawDeal.id) || {};
  const liveDate = dp.customer_live_date || null;
  const companyId = dealIdToCompanyId.get(rawDeal.id) ?? null;

  // Sales owner: pulled from the priced sales fallback (or any sales deal as
  // 2nd fallback). Mirrors the onboarding brief; falls back to "missing" so
  // the UI can render that string verbatim instead of an empty cell.
  const salesFallback = companyId ? salesFallbackByCompany.get(companyId) : undefined;
  const salesOwnerName = salesFallback ? (ownerNameMap[salesFallback.ownerId] ?? "missing") : "missing";

  // Commercial — pull the same way onboarding does.
  const commercial: OnboardingCommercial = {
    monthlyFee: formatMonthlyFee(dp.core_net_price__local_currency, dp.deal_currency_code),
    acv: formatAcv(dp.amount_in_home_currency),
    bookingFee: formatBookingFee(dp.booking_fee, dp.confirmed_booking_fee),
    firstBilling: formatFirstBilling(dp.test_billing_start_date),
    salesOwner: salesOwnerName,
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
  const ownerName = ownerId ? (ownerNameMap[ownerId] || "") : "";

  // Primary contact: first associated contact from the deal. Empty when the
  // deal has no contact link in HubSpot.
  const contact = contactMap.get(rawDeal.id);
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || null
    : null;

  return {
    dealId: rawDeal.id,
    companyId,
    companyName: cp.name || dp.dealname || "(unknown)",
    ownerId,
    ownerName,
    country: cp.understory_company_country || null,
    customerStage: dp.customer_stage || "",
    customerSubstage: dp.customer_substage || null,
    liveDate,
    daysLive: daysSinceIso(nowIso, liveDate),
    contactName,
    contactEmail: contact?.email ?? null,
    contactPhone: contact?.phone ?? null,
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
