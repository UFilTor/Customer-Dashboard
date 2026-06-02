import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import {
  EXPECTED_DAYS,
  LIFECYCLE_PIPELINE,
  ONBOARDING_STAGES,
  classifyStep,
  daysSince,
  dedupMeetings,
  endOfNthWorkDay,
  fetchAssociations,
  fetchHistoryForDeals,
  fetchObjectsBatch,
  fetchOwnerNames,
  fetchPrimaryContactsForDeals,
  fetchSalesDealsForCompanies,
  fetchUpcomingMeetingsByOwners,
  formatAcv,
  formatBookingFee,
  formatFirstBilling,
  formatMonthlyFee,
  nullable,
  parseEnableUnderstoryPay,
  pickSalesFallback,
  type ContactInfo,
} from "./onboarding";
import { hasUnpaidInvoice, unpaidAmountLocal, unpaidInvoiceCount } from "./invoice-fields";
import { computeWatchOutSignals } from "./signals";
import { classifyPortfolioStage } from "./portfolio";
import type {
  MeetingPrepDeal,
  MeetingPrepMeetingEntry,
  MeetingPrepResponse,
  OnboardingCommercial,
  OnboardingMeeting,
  OnboardingObNotesExtended,
  OnboardingStep,
  RetentionInvoiceState,
  WatchOutSignal,
} from "./types";

// Customer Retention pipeline. Same constant lives in attention.ts (where
// it's the scope for churn-risk signals). Keep them in sync.
export const RETENTION_PIPELINE = "1072518362";

// customer_stage values to EXCLUDE from the retention pipeline. Churned
// customers are out of scope: nothing to prep, nothing to retain.
const EXCLUDED_RETENTION_STAGES = new Set(["Churned"]);

// EUR conversion table — kept in sync with src/lib/pay-migration.ts. Only
// covers the currencies the CS team actually transacts in.
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

/** Extract the deal's invoice state for the brief's Commercial section. */
export function extractInvoiceState(
  props: Record<string, string>,
  nowIso: string
): RetentionInvoiceState {
  const open = unpaidInvoiceCount(props);
  const unpaid = hasUnpaidInvoice(props);
  const dueIso = props.understory_earliest_unpaid_invoice_due_date || "";
  const outstandingRaw = unpaidAmountLocal(props);
  const currency = props.deal_currency_code || props.currency;

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

/** True when the lifecycle/retention pipeline ID is one we surface in the unified meeting prep. */
export function isMeetingPrepPipeline(pipeline: string | undefined): boolean {
  return pipeline === LIFECYCLE_PIPELINE || pipeline === RETENTION_PIPELINE;
}

/** Filter rule for retention deals — pipeline match plus not Churned. */
export function isRetentionScope(props: {
  pipeline?: string;
  customer_stage?: string;
}): boolean {
  if (props.pipeline !== RETENTION_PIPELINE) return false;
  return !EXCLUDED_RETENTION_STAGES.has(props.customer_stage || "");
}

/** Filter rule for lifecycle (onboarding) deals — pipeline + active onboarding stage. */
export function isLifecycleScope(props: {
  pipeline?: string;
  customer_stage?: string;
}): boolean {
  if (props.pipeline !== LIFECYCLE_PIPELINE) return false;
  return ONBOARDING_STAGES.includes(props.customer_stage || "");
}

const LIFECYCLE_DEAL_PROPS = [
  "dealname",
  "pipeline",
  "dealstage",
  "customer_stage",
  "customer_substage",
  "hs_v2_date_entered_current_stage",
  "createdate",
  "customer_live_date",
  "customer_live",
  "currency",
  "deal_currency_code",
  "subscription_plan",
  "hubspot_owner_id",
  "self_onboarding",
  // OB Notes
  "enable_understory_pay",
  "understory_pay_status__customer",
  "storefront",
  "ob_note___customer_needs_",
  "ob_note___promises_made",
  "ob_note___link_to_experience_s__that_need_to_be_created_",
  "ob_note___grow_notes__if_booked_",
  // Commercial
  "booking_fee",
  "confirmed_booking_fee",
  "core_net_price__local_currency",
  "amount_in_home_currency",
  "test_billing_start_date",
  // Watch-outs
  "hibernation_notes",
  "product_hold_note",
  "notes_last_contacted",
  "wish_to_churn",
  "churn_reason",
  // Invoice
  "understory_earliest_unpaid_invoice_created_date",
  "understory_earliest_unpaid_invoice_due_date",
  "understory_number_of_unpaid_invoices",
  "understory_unpaid_amount_local_currency",
  "payment_method",
];

const RETENTION_DEAL_PROPS = [
  "dealname",
  "pipeline",
  "dealstage",
  "customer_stage",
  "customer_substage",
  "createdate",
  "customer_live_date",
  "currency",
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
  "understory_earliest_unpaid_invoice_created_date",
  "understory_earliest_unpaid_invoice_due_date",
  "understory_number_of_unpaid_invoices",
  "understory_unpaid_amount_local_currency",
  "payment_method",
  // Watch-outs
  "wish_to_churn",
  "churn_reason",
  "notes_last_contacted",
  // Storefront
  "storefront",
];

const COMPANY_PROPS_FOR_MEETING_PREP = [
  "name",
  "domain",
  "hubspot_owner_id",
  "notes_last_contacted",
  "understory_company_country",
  // Volume / health (used by retention-flavored briefs + watch-outs)
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

interface BuildOptions {
  ownerIds?: string[];
  meetingFromIso?: string;
  meetingToIso?: string;
}

interface PayloadOnly {
  deals: MeetingPrepDeal[];
  meetings: MeetingPrepMeetingEntry[];
}

// `understory_health_score_upcoming_events` is a 0-1 score, not a count.
function parseUpcomingEventsScore(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

/**
 * Build the unified meeting prep payload: every meeting on a deal in either
 * the lifecycle or retention pipeline that the given owners (or all owners)
 * have on their calendar in the requested window.
 */
export async function buildMeetingPrepPayload(
  opts: BuildOptions = {}
): Promise<PayloadOnly> {
  const ownerIds = opts.ownerIds;
  const nowIso = new Date().toISOString();

  // 1. Search both pipelines in parallel. Pagination caps at 50 pages each.
  const [lifecycleDeals, retentionDeals] = await Promise.all([
    searchDealsByPipeline({
      ownerIds,
      pipeline: LIFECYCLE_PIPELINE,
      stages: ONBOARDING_STAGES,
      excludeStages: null,
      properties: LIFECYCLE_DEAL_PROPS,
    }),
    searchDealsByPipeline({
      ownerIds,
      pipeline: RETENTION_PIPELINE,
      stages: null,
      excludeStages: [...EXCLUDED_RETENTION_STAGES],
      properties: RETENTION_DEAL_PROPS,
    }),
  ]);

  const allRawDeals = [...lifecycleDeals, ...retentionDeals];
  const dealIds = allRawDeals.map((d) => d.id);

  // 2. Meeting window setup. Default = today + next 4 work days (5 total).
  const meetingFromIso =
    opts.meetingFromIso ?? new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const meetingToIso =
    opts.meetingToIso ?? endOfNthWorkDay(new Date(), 5).toISOString();

  // CS owner scope for the meeting fetch. When the caller doesn't restrict,
  // use the deals' owners. Mirrors onboarding/retention behavior.
  const dealOwnerIds = Array.from(
    new Set(
      allRawDeals
        .map((d) => d.properties?.hubspot_owner_id || "")
        .filter(Boolean)
    )
  );
  const csOwnerIds =
    ownerIds && ownerIds.length > 0 ? ownerIds : dealOwnerIds;

  // 3. Independent fetches concurrently. Sales deals depend on companyMap, so
  // chain it off the companies promise to overlap with the others.
  const dealToCompanyPromise = fetchDealToCompany(dealIds);
  const companyMapPromise = dealToCompanyPromise.then(async (
    dealIdToCompanyId
  ) => {
    const companyIds = Array.from(new Set(Array.from(dealIdToCompanyId.values())));
    const companyProps =
      companyIds.length > 0
        ? await fetchObjectsBatch("companies", companyIds, COMPANY_PROPS_FOR_MEETING_PREP)
        : new Map<string, Record<string, string>>();
    const byDeal = new Map<string, Record<string, string>>();
    for (const [dealId, companyId] of dealIdToCompanyId.entries()) {
      const props = companyProps.get(companyId);
      if (props) byDeal.set(dealId, props);
    }
    return { dealIdToCompanyId, companyIds, byDeal };
  });
  const contactsPromise =
    dealIds.length > 0
      ? fetchPrimaryContactsForDeals(dealIds)
      : Promise.resolve(new Map<string, ContactInfo>());
  const salesDealsPromise = companyMapPromise.then(({ companyIds }) =>
    fetchSalesDealsForCompanies(companyIds)
  );
  const ownerMeetingsPromise =
    csOwnerIds.length > 0
      ? fetchUpcomingMeetingsByOwners(csOwnerIds, meetingFromIso, meetingToIso)
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchUpcomingMeetingsByOwners>>);

  const [companyData, contactMap, salesDealsByCompany, ownerMeetings] =
    await Promise.all([
      companyMapPromise,
      contactsPromise,
      salesDealsPromise,
      ownerMeetingsPromise,
    ]);
  const { dealIdToCompanyId, byDeal: companyMap } = companyData;

  // 4. Sales fallback per company so each deal can attribute a sales owner.
  const salesFallbackByCompany = new Map<string, { ownerId: string; isPriced: boolean; deal: { properties: Record<string, string> } }>();
  for (const [companyId, list] of salesDealsByCompany) {
    const fallback = pickSalesFallback(list);
    if (!fallback) continue;
    const sownerId = fallback.deal.properties.hubspot_owner_id;
    salesFallbackByCompany.set(companyId, {
      ownerId: sownerId || "",
      isPriced: fallback.isPriced,
      deal: fallback.deal,
    });
  }

  // 5. Resolve owner names for the union of deal owners and sales-deal owners.
  const dealOwnerIdsRaw = allRawDeals
    .map((d) => d.properties?.hubspot_owner_id || "")
    .filter(Boolean);
  const salesOwnerIdsRaw: string[] = [];
  for (const list of salesDealsByCompany.values()) {
    for (const d of list) {
      if (d.properties.hubspot_owner_id) salesOwnerIdsRaw.push(d.properties.hubspot_owner_id);
    }
  }
  const ownerNameMap = await fetchOwnerNames(
    Array.from(new Set([...dealOwnerIdsRaw, ...salesOwnerIdsRaw]))
  );

  // 6. Resolve which deal each meeting belongs to. Walk deals → meetings; HubSpot
  // indexes that direction reliably, the inverse can return empty.
  const meetingToDeal = await resolveDealsForMeetings(
    ownerMeetings.map((m) => m.id),
    new Set(dealIds)
  );

  // 7. Build MeetingPrepDeal[] from raw deals + companies.
  const meetingPrepDeals: MeetingPrepDeal[] = allRawDeals.map((d) =>
    buildMeetingPrepDeal(
      d,
      companyMap,
      ownerNameMap,
      dealIdToCompanyId,
      contactMap,
      salesFallbackByCompany,
      nowIso
    )
  );
  const dealById = new Map(meetingPrepDeals.map((d) => [d.dealId, d]));

  // 8. Build the meeting entries (only meetings that resolved to a deal).
  const meetingOwnerIds = new Set<string>();
  for (const m of ownerMeetings) {
    if (m.properties?.hubspot_owner_id) meetingOwnerIds.add(m.properties.hubspot_owner_id);
  }
  const meetingOwnerNames = await fetchOwnerNames(Array.from(meetingOwnerIds));

  // First pass: turn each raw HubSpot meeting that resolved to a deal into an
  // OnboardingMeeting + record the dealId. Group by deal so the calendar+Gong
  // dedup runs per-deal — pairs are only considered duplicates within the
  // same deal scope.
  const meetingsByDeal = new Map<string, OnboardingMeeting[]>();
  for (const raw of ownerMeetings) {
    const dealId = meetingToDeal.get(raw.id);
    if (!dealId) continue;
    if (!dealById.has(dealId)) continue;
    const startsAt = raw.properties?.hs_meeting_start_time;
    if (!startsAt) continue;
    const ownerId = raw.properties?.hubspot_owner_id || "";
    const meeting: OnboardingMeeting = {
      id: raw.id,
      title:
        (raw.properties?.hs_meeting_title || "(Untitled meeting)").trim() ||
        "(Untitled meeting)",
      startsAt,
      endsAt: raw.properties?.hs_meeting_end_time || null,
      body: raw.properties?.hs_meeting_body || null,
      internalNotes: raw.properties?.hs_internal_meeting_notes || null,
      outcome: raw.properties?.hs_meeting_outcome || null,
      activityType: raw.properties?.hs_activity_type || null,
      ownerId,
      ownerName: ownerId ? meetingOwnerNames[ownerId] ?? null : null,
    };
    if (!meetingsByDeal.has(dealId)) meetingsByDeal.set(dealId, []);
    meetingsByDeal.get(dealId)!.push(meeting);
  }

  const meetingEntries: MeetingPrepMeetingEntry[] = [];
  for (const [dealId, meetings] of meetingsByDeal) {
    const deal = dealById.get(dealId);
    if (!deal) continue;
    for (const meeting of dedupMeetings(meetings)) {
      meetingEntries.push({ meeting, deal });
    }
  }
  meetingEntries.sort((a, b) =>
    a.meeting.startsAt.localeCompare(b.meeting.startsAt)
  );

  return { deals: meetingPrepDeals, meetings: meetingEntries };
}

/**
 * Search HubSpot for deals on a given pipeline. Always sends a sorts clause to
 * keep pagination working (see AGENTS.md). Retries 429/5xx.
 */
async function searchDealsByPipeline(opts: {
  ownerIds: string[] | undefined;
  pipeline: string;
  stages: string[] | null;
  excludeStages: string[] | null;
  properties: string[];
}): Promise<Array<{ id: string; properties: Record<string, string> }>> {
  const baseFilters: unknown[] = [
    { propertyName: "pipeline", operator: "EQ", value: opts.pipeline },
  ];
  if (opts.stages && opts.stages.length > 0) {
    baseFilters.push({ propertyName: "customer_stage", operator: "IN", values: opts.stages });
  }
  if (opts.excludeStages && opts.excludeStages.length > 0) {
    baseFilters.push({
      propertyName: "customer_stage",
      operator: "NOT_IN",
      values: opts.excludeStages,
    });
  }
  const filters: unknown[] =
    opts.ownerIds && opts.ownerIds.length > 0
      ? [...baseFilters, { propertyName: "hubspot_owner_id", operator: "IN", values: opts.ownerIds }]
      : baseFilters;
  const filterGroups = [{ filters }];

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

// Small retry wrapper for transient HubSpot 429/5xx errors.
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

// Batch-fetch the dealId -> companyId map via associations API.
async function fetchDealToCompany(dealIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (dealIds.length === 0) return out;
  const assocs = await fetchAssociations("deals", "companies", dealIds);
  for (const a of assocs) {
    if (a.toIds[0]) out.set(a.fromId, a.toIds[0]);
  }
  return out;
}

// Resolve a list of meeting IDs to their associated deal (any of ours).
async function resolveDealsForMeetings(
  meetingIds: string[],
  allowedDealIds: Set<string>
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (meetingIds.length === 0 || allowedDealIds.size === 0) return out;
  const wanted = new Set(meetingIds);
  const assocs = await fetchAssociations(
    "deals",
    "meetings",
    Array.from(allowedDealIds)
  );
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

// Compose a MeetingPrepDeal from raw HubSpot deal + matching company props.
function buildMeetingPrepDeal(
  rawDeal: { id: string; properties: Record<string, string> },
  companyMap: Map<string, Record<string, string>>,
  ownerNameMap: Record<string, string>,
  dealIdToCompanyId: Map<string, string>,
  contactMap: Map<string, ContactInfo>,
  salesFallbackByCompany: Map<
    string,
    { ownerId: string; isPriced: boolean; deal: { properties: Record<string, string> } }
  >,
  nowIso: string
): MeetingPrepDeal {
  const dp = rawDeal.properties || {};
  const cp = companyMap.get(rawDeal.id) || {};
  const companyId = dealIdToCompanyId.get(rawDeal.id) ?? null;
  const isLifecycle = dp.pipeline === LIFECYCLE_PIPELINE;
  const pipeline: MeetingPrepDeal["pipeline"] = isLifecycle ? "lifecycle" : "retention";

  // Sales owner: pulled from the priced sales fallback (or any sales deal as
  // 2nd fallback). Mirrors onboarding/retention; falls back to "missing".
  const salesFallback = companyId ? salesFallbackByCompany.get(companyId) : undefined;
  const salesOwnerId = salesFallback?.ownerId || "";
  const salesOwnerName = salesOwnerId
    ? ownerNameMap[salesOwnerId] ?? "missing"
    : "missing";

  // Monthly fee — for lifecycle deals, prefer the priced sales deal (default
  // currency on lifecycle is often EUR regardless of the actual deal currency).
  // For retention deals we use the deal's own currency.
  let feeAmount: string | undefined = dp.core_net_price__local_currency;
  let feeCurrency: string | undefined = dp.deal_currency_code || dp.currency;
  if (isLifecycle && salesFallback?.isPriced) {
    feeAmount = salesFallback.deal.properties.core_net_price__local_currency;
    feeCurrency =
      salesFallback.deal.properties.deal_currency_code ||
      salesFallback.deal.properties.currency;
  }

  // First billing — lifecycle uses test_billing_start_date with sales fallback;
  // retention deals show whatever the deal carries (no fallback).
  let firstBilling = formatFirstBilling(dp.test_billing_start_date);
  if (isLifecycle && firstBilling == null && salesFallback) {
    firstBilling = formatFirstBilling(salesFallback.deal.properties.test_billing_start_date);
  }

  const commercial: OnboardingCommercial = {
    monthlyFee: formatMonthlyFee(feeAmount, feeCurrency),
    acv: formatAcv(dp.amount_in_home_currency),
    bookingFee: formatBookingFee(dp.booking_fee, dp.confirmed_booking_fee),
    firstBilling,
    salesOwner: salesOwnerName,
  };

  const invoices = extractInvoiceState(dp, nowIso);
  const futureEvents = parseUpcomingEventsScore(cp.understory_health_score_upcoming_events);

  // Pipeline + customer-stage → 5-stage Portfolio taxonomy. Used both to
  // gate signals via STAGE_APPLICABILITY and to drive the brief's stage chip.
  const portfolioStage = classifyPortfolioStage(
    dp.customer_stage || "",
    dp.pipeline || "",
    dp.customer_substage || null
  );

  // Stuck-in-step inputs. Lifecycle deals always populate daysInStep via the
  // OnboardingStep classifier below; retention deals get it computed here so
  // STAGE_APPLICABILITY.stuck_in_step ["Onboarding","Adopted","Started"]
  // fires for all three. Ramp Up + Established stay null (signal gated off
  // for those stages anyway, but keeping the input null is the principled
  // way to express "stuck-in-step doesn't apply here").
  let step: OnboardingStep | null = null;
  let daysInStep: number | null = null;
  let expectedDaysInStep: number | null = null;
  let obNotes: OnboardingObNotesExtended | null = null;

  // Retention-stage expected step durations. Mirrors PORTFOLIO_EXPECTED_DAYS
  // in portfolio.ts; inlined to avoid a cross-lib import for two numbers.
  const RETENTION_EXPECTED_DAYS: Record<string, number> = {
    Adopted: 14,
    Started: 30,
  };

  // Retention-only fields
  const liveDate = dp.customer_live_date || null;
  const daysLive = isLifecycle ? null : daysSinceIso(nowIso, liveDate);

  if (isLifecycle) {
    const stage = dp.customer_stage || "";
    const substage = nullable(dp.customer_substage);
    const customerLiveDate =
      nullable(dp.customer_live_date) ?? nullable(dp.customer_live);
    step = classifyStep(stage, substage, customerLiveDate);
    const enteredStageDate = nullable(dp.hs_v2_date_entered_current_stage);
    daysInStep = enteredStageDate != null
      ? daysSince(enteredStageDate)
      : daysSince(nullable(dp.createdate));
    expectedDaysInStep = EXPECTED_DAYS[step] ?? 30;

    const contact = contactMap.get(rawDeal.id);
    const contactName = contact
      ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || null
      : null;

    obNotes = {
      understoryPayEnabled: parseEnableUnderstoryPay(dp.enable_understory_pay),
      contactEmail: contact?.email ?? null,
      contactPhone: contact?.phone ?? null,
      customerNeeds: nullable(dp["ob_note___customer_needs_"]),
      promisesMade: nullable(dp["ob_note___promises_made"]),
      experiencesLink: nullable(dp["ob_note___link_to_experience_s__that_need_to_be_created_"]),
      growNotes: nullable(dp["ob_note___grow_notes__if_booked_"]),
      contactName,
      companyDomain: cp.domain || null,
      storefrontLink: nullable(dp.storefront),
      payStatus: nullable(dp.understory_pay_status__customer),
    };
  } else if (portfolioStage === "Adopted" || portfolioStage === "Started") {
    // Retention deal in a stuck-applicable stage: derive daysInStep from
    // hs_v2_date_entered_current_stage so stuck_in_step can fire for these
    // stages too (Portfolio already does this; Meeting Prep was missing it).
    const enteredStageDate = nullable(dp.hs_v2_date_entered_current_stage);
    if (enteredStageDate != null) {
      daysInStep = daysSince(enteredStageDate);
      expectedDaysInStep = RETENTION_EXPECTED_DAYS[portfolioStage] ?? null;
    }
  }

  const watchOuts: WatchOutSignal[] = computeWatchOutSignals({
    nowIso,
    unpaidInvoice: hasUnpaidInvoice(dp),
    invoiceDueDate: dp.understory_earliest_unpaid_invoice_due_date || null,
    outstandingEur: invoices.outstandingEur,
    overdueDays: invoices.overdueDays,
    wishToChurn: dp.wish_to_churn === "true",
    churnReason: dp.churn_reason || null,
    volume3m: parseFloat(cp.understory_booking_volume_3m || "0") || 0,
    volume6m: parseFloat(cp.understory_booking_volume_6m || "0") || 0,
    healthScore: parseFloat(cp.health_score || "") || null,
    upcomingEvents: futureEvents,
    notesLastContacted: cp.notes_last_contacted || dp.notes_last_contacted || null,
    // daysInStep / expectedDaysInStep are populated for lifecycle deals AND
    // for retention deals in stages where stuck_in_step is applicable
    // (Adopted, Started). STAGE_APPLICABILITY in computeWatchOutSignals does
    // the final gate, so passing the values here is safe for any stage.
    daysInStep,
    expectedDaysInStep,
    stage: portfolioStage,
  });

  const ownerId = dp.hubspot_owner_id || "";
  const ownerName = ownerId ? ownerNameMap[ownerId] || "" : "";

  // Primary contact (used for retention shape; lifecycle reuses the obNotes
  // path but the top-level contact fields stay populated for both).
  const contact = contactMap.get(rawDeal.id);
  const contactName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || null
    : null;

  return {
    pipeline,
    dealId: rawDeal.id,
    companyId,
    companyName: cp.name || dp.dealname || "(unknown)",
    ownerId,
    ownerName,
    country: cp.understory_company_country || null,
    customerStage: dp.customer_stage || "",
    customerSubstage: dp.customer_substage || null,
    contactName,
    contactEmail: contact?.email ?? null,
    contactPhone: contact?.phone ?? null,
    companyDomain: cp.domain || null,
    storefrontLink: dp.storefront || null,
    commercial,
    invoices,
    futureEvents,
    step,
    daysInStep,
    expectedDaysInStep,
    obNotes,
    liveDate,
    daysLive,
    companyProps: cp,
    history: [], // backfilled by /api/meeting-prep/history
    watchOuts,
    lastTouch: cp.notes_last_contacted || dp.notes_last_contacted || null,
  };
}

// Re-export the lazy history fetcher under a meeting-prep-flavored name. It's
// the same primitive — engagements per deal.
export const fetchMeetingPrepHistoryForDeals = fetchHistoryForDeals;

// Wrap the buildMeetingPrepPayload return into the response shape callers
// expect. The bulk endpoint ships only the meetings (with their attached
// deals) and scalar pool counts. Shipping the full deals[] array meant
// hydrating 700+ deal objects (~1.5MB raw) for two count tiles.
export async function buildMeetingPrepResponse(
  opts: BuildOptions = {}
): Promise<MeetingPrepResponse> {
  const payload = await buildMeetingPrepPayload(opts);
  let lifecycle = 0;
  let retention = 0;
  for (const d of payload.deals) {
    if (d.pipeline === "lifecycle") lifecycle++;
    else if (d.pipeline === "retention") retention++;
  }
  return {
    meetings: payload.meetings,
    dealsTotal: payload.deals.length,
    lifecycleDealsTotal: lifecycle,
    retentionDealsTotal: retention,
    updatedAt: new Date().toISOString(),
  };
}
