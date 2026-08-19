import {
  DEFAULT_EXPECTED_DAYS,
  EXPECTED_DAYS,
  RETENTION_EXPECTED_DAYS,
} from "@/config/thresholds";
import {
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
import {
  SLT_COMPANY_PROPS,
  SLT_DEAL_PROPS,
  buildSinceLastTouch,
  fetchPropertyHistories,
} from "./since-last-touch";
import { computeWatchOutSignals } from "./signals";
import { OWNERS } from "./owners";
import { searchObjectsPage } from "./hubspot-search";
import { classifyPortfolioStage } from "./portfolio";
import { toEur } from "./fx";
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

// Expansion pipeline (HubSpot label: "Expansion Pipeline") — upsell deals
// (e.g. add-on products, Understory Pay) on existing customers. These carry
// plain `dealstage` values, not `customer_stage` — no onboarding/retention
// taxonomy applies, so expansion decks get their own lightweight brief.
export const EXPANSION_PIPELINE = "3687958771";

// customer_stage values to EXCLUDE from the retention pipeline. Churned
// customers are out of scope: nothing to prep, nothing to retain.
const EXCLUDED_RETENTION_STAGES = new Set(["Churned"]);

// dealstage IDs to EXCLUDE from the expansion pipeline. Closed Lost deals
// are out of scope: nothing to prep for a dead upsell.
const EXCLUDED_EXPANSION_STAGES = new Set(["5112925395"]); // Closed Lost

// Expansion pipeline dealstage ID -> human-readable label, for the
// lightweight expansion brief card. Values from HubSpot's `dealstage`
// enumeration, filtered to those observed on Expansion Pipeline deals.
const EXPANSION_STAGE_LABELS: Record<string, string> = {
  "5866022117": "Upsell Potential",
  "5112925389": "Interest Identified",
  "5112925390": "In Conversation",
  "5112925393": "Contract Sent",
  "5112925394": "Closed Won",
  "5112925395": "Closed Lost",
};

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

/** True when the lifecycle/retention/expansion pipeline ID is one we surface in the unified meeting prep. */
export function isMeetingPrepPipeline(pipeline: string | undefined): boolean {
  return (
    pipeline === LIFECYCLE_PIPELINE ||
    pipeline === RETENTION_PIPELINE ||
    pipeline === EXPANSION_PIPELINE
  );
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

/** Filter rule for expansion deals — pipeline match plus not Closed Lost. */
export function isExpansionScope(props: {
  pipeline?: string;
  dealstage?: string;
}): boolean {
  if (props.pipeline !== EXPANSION_PIPELINE) return false;
  return !EXCLUDED_EXPANSION_STAGES.has(props.dealstage || "");
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
  spans?: { label: string; ms: number }[];
}

interface PayloadOnly {
  // Meetings-first build: `deals` only contains deals attached to a surfaced
  // meeting (a handful), never the full pipeline pool. Pool sizes for the
  // count tiles come from HubSpot's search `total` instead.
  deals: MeetingPrepDeal[];
  meetings: MeetingPrepMeetingEntry[];
  lifecycleDealsTotal: number;
  retentionDealsTotal: number;
  expansionDealsTotal: number;
}

// `understory_health_score_upcoming_events` is a 0-1 score, not a count.
function parseUpcomingEventsScore(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

/**
 * Build the unified meeting prep payload: every meeting on a deal in the
 * lifecycle, retention, or expansion pipeline that the given owners (or all
 * owners) have on their calendar in the requested window.
 */
export async function buildMeetingPrepPayload(
  opts: BuildOptions = {}
): Promise<PayloadOnly> {
  const ownerIds = opts.ownerIds;
  const nowIso = new Date().toISOString();
  const mark = (label: string, t0: number) => {
    opts.spans?.push({ label, ms: Math.round(performance.now() - t0) });
  };

  // Meetings-first build. The old flow paginated ALL ~700 deals in both
  // pipelines up front (the bulk of a 6s cold build) just to (a) derive the
  // meeting-search owner scope, (b) match meetings to deals, and (c) count
  // two tiles. Instead: fetch the calendar meetings, resolve THEIR deals via
  // the meetings->deals association (verified reliable against HubSpot), and
  // get pool counts from the search API's `total` field.

  // 1. Meeting window setup. Default = today + next 4 work days (5 total).
  const meetingFromIso =
    opts.meetingFromIso ?? new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const meetingToIso =
    opts.meetingToIso ?? endOfNthWorkDay(new Date(), 5).toISOString();

  // CS owner scope for the meeting fetch. When the caller doesn't restrict,
  // use the static CS owner roster (the same universe the filter UI offers).
  const csOwnerIds =
    ownerIds && ownerIds.length > 0 ? ownerIds : OWNERS.map((o) => o.id);

  // 2. Everything without a data dependency starts at t=0: the calendar
  // meetings, the two pool counts, and the owner directory.
  const tMeetings = performance.now();
  const ownerMeetingsPromise = fetchUpcomingMeetingsByOwners(
    csOwnerIds,
    meetingFromIso,
    meetingToIso
  );
  const countsPromise = Promise.all([
    countDealsInScope("lifecycle", ownerIds),
    countDealsInScope("retention", ownerIds),
    countDealsInScope("expansion", ownerIds),
  ]);
  const ownerNamesPromise = fetchOwnerNames(OWNERS.map((o) => o.id));

  const ownerMeetings = await ownerMeetingsPromise;
  mark("hubspot.meetings", tMeetings);

  // 3. meetings -> deals association, then batch-read only those deals and
  // keep the ones in scope (lifecycle onboarding stages / retention
  // non-churned / expansion non-closed-lost). A meeting maps to its first
  // in-scope deal.
  const tDeals = performance.now();
  const meetingIds = ownerMeetings.map((m) => m.id);
  const meetingAssocs = meetingIds.length > 0
    ? await fetchAssociations("meetings", "deals", meetingIds)
    : [];
  const candidateDealIds = Array.from(
    new Set(meetingAssocs.flatMap((a) => a.toIds))
  );
  const candidateProps = candidateDealIds.length > 0
    ? await fetchObjectsBatch("deals", candidateDealIds, ALL_MEETING_PREP_DEAL_PROPS)
    : new Map<string, Record<string, string>>();

  const inScope = (props: Record<string, string> | undefined): boolean => {
    if (!props) return false;
    const scopeProps = { pipeline: props.pipeline, customer_stage: props.customer_stage };
    if (
      isLifecycleScope(scopeProps) ||
      isRetentionScope(scopeProps) ||
      isExpansionScope({ pipeline: props.pipeline, dealstage: props.dealstage })
    ) {
      return true;
    }
    // Include lifecycle deals in hibernation or product hold (they still need prep).
    if (props.pipeline === LIFECYCLE_PIPELINE) {
      const substage = props.customer_substage || "";
      if (substage.toLowerCase().includes("hibernation") ||
          substage.toLowerCase().includes("product") ||
          substage.toLowerCase().includes("hold")) {
        return true;
      }
    }
    return false;
  };
  // No deal-owner restriction here: the meeting is already scoped to the
  // filtered CS person(s) by fetchUpcomingMeetingsByOwners (owner OR
  // attendee match). A meeting a colleague, Sales, or the CEO organizes with
  // a CS person on it should surface regardless of who owns the underlying
  // deal/account.
  const dealAllowed = (props: Record<string, string> | undefined): boolean =>
    inScope(props);

  const meetingToDeal = new Map<string, string>();
  const surfacedDealIds = new Set<string>();
  for (const a of meetingAssocs) {
    const match = a.toIds.find((dealId) => dealAllowed(candidateProps.get(dealId)));
    if (match) {
      meetingToDeal.set(a.fromId, match);
      surfacedDealIds.add(match);
    }
  }

  // 3b. Company fallback for meetings with no in-scope deal association —
  // either no deal link at all, or only deals in an out-of-scope
  // pipeline/stage. Walk meeting -> company (direct, or via contact when the
  // meeting has no direct company link) -> company's other deals, same
  // pattern as the older onboarding.ts orphan-meeting flow, scoped to just
  // the meetings that still need it.
  const unresolvedMeetingIds = meetingIds.filter((id) => !meetingToDeal.has(id));
  if (unresolvedMeetingIds.length > 0) {
    const [meetingCompanyAssocs, meetingContactAssocs] = await Promise.all([
      fetchAssociations("meetings", "companies", unresolvedMeetingIds),
      fetchAssociations("meetings", "contacts", unresolvedMeetingIds),
    ]);
    const meetingToCompany = new Map<string, string>();
    for (const a of meetingCompanyAssocs) {
      if (a.toIds[0]) meetingToCompany.set(a.fromId, a.toIds[0]);
    }
    // Contact -> company fallback for meetings still missing a company link
    // (common for Gong-imported / calendar-only meetings).
    const meetingToContacts = new Map<string, string[]>();
    const allContactIds = new Set<string>();
    for (const a of meetingContactAssocs) {
      if (meetingToCompany.has(a.fromId)) continue;
      meetingToContacts.set(a.fromId, a.toIds);
      for (const cid of a.toIds) allContactIds.add(cid);
    }
    if (allContactIds.size > 0) {
      const contactCompanyAssocs = await fetchAssociations(
        "contacts",
        "companies",
        Array.from(allContactIds)
      );
      const contactToCompany = new Map<string, string>();
      for (const a of contactCompanyAssocs) {
        if (a.toIds[0]) contactToCompany.set(a.fromId, a.toIds[0]);
      }
      for (const [meetingId, contactIds] of meetingToContacts) {
        for (const cid of contactIds) {
          const companyId = contactToCompany.get(cid);
          if (companyId) {
            meetingToCompany.set(meetingId, companyId);
            break;
          }
        }
      }
    }

    const fallbackCompanyIds = Array.from(new Set(meetingToCompany.values()));
    if (fallbackCompanyIds.length > 0) {
      const companyDealAssocs = await fetchAssociations(
        "companies",
        "deals",
        fallbackCompanyIds
      );
      const companyToDealIds = new Map<string, string[]>();
      const newDealIds = new Set<string>();
      for (const a of companyDealAssocs) {
        companyToDealIds.set(a.fromId, a.toIds);
        for (const id of a.toIds) {
          if (!candidateProps.has(id)) newDealIds.add(id);
        }
      }
      if (newDealIds.size > 0) {
        const newProps = await fetchObjectsBatch(
          "deals",
          Array.from(newDealIds),
          ALL_MEETING_PREP_DEAL_PROPS
        );
        for (const [id, props] of newProps) candidateProps.set(id, props);
      }
      // Pick each company's best in-scope deal: lifecycle wins over retention
      // wins over expansion (mirrors onboarding.ts's orphan-flow ranking),
      // tie-broken by most-recently created.
      const pipelineRank = (p: string | undefined) =>
        p === LIFECYCLE_PIPELINE ? 0 : p === RETENTION_PIPELINE ? 1 : 2;
      const fallbackDealByCompany = new Map<string, string>();
      for (const [companyId, companyDealIds] of companyToDealIds) {
        const candidates = companyDealIds
          .map((id) => ({ id, props: candidateProps.get(id) }))
          .filter(
            (c): c is { id: string; props: Record<string, string> } =>
              c.props != null && dealAllowed(c.props)
          );
        if (candidates.length === 0) continue;
        candidates.sort((a, b) => {
          const r = pipelineRank(a.props.pipeline) - pipelineRank(b.props.pipeline);
          if (r !== 0) return r;
          return (b.props.createdate || "").localeCompare(a.props.createdate || "");
        });
        fallbackDealByCompany.set(companyId, candidates[0].id);
      }
      for (const meetingId of unresolvedMeetingIds) {
        const companyId = meetingToCompany.get(meetingId);
        const dealId = companyId ? fallbackDealByCompany.get(companyId) : undefined;
        if (dealId) {
          meetingToDeal.set(meetingId, dealId);
          surfacedDealIds.add(dealId);
        }
      }
    }
  }

  const allRawDeals = Array.from(surfacedDealIds).map((id) => ({
    id,
    properties: candidateProps.get(id) || {},
  }));
  const dealIds = allRawDeals.map((d) => d.id);
  mark("hubspot.deals", tDeals);

  // 4. Per-deal enrichment — companies, contacts, sales deals — now over the
  // handful of surfaced deals instead of the full pool. Sales deals depend on
  // companyMap, so chain it off the companies promise to overlap.
  const tEnrich = performance.now();
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

  const [companyData, contactMap, salesDealsByCompany] =
    await Promise.all([
      companyMapPromise,
      contactsPromise,
      salesDealsPromise,
    ]);
  const { dealIdToCompanyId, byDeal: companyMap } = companyData;
  mark("hubspot.enrich", tEnrich);

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

  // 5. Owner names: the directory promise from t=0 covers every owner
  // (fetchOwnerNames returns the whole directory for any non-empty input).
  const ownerNameMap = await ownerNamesPromise;

  // 6. (meetings -> deals already resolved above, meetings-first.)

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
  const meetingOwnerNames = ownerNameMap;

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

  // 9. "Since last touch" change feed — only for the deals actually attached
  // to a surfaced meeting (a handful), never the full pool. Two parallel
  // history batch reads; best-effort.
  const surfacedDeals = Array.from(
    new Map(meetingEntries.map((e) => [e.deal.dealId, e.deal])).values()
  );
  const surfacedCompanyIds = Array.from(
    new Set(surfacedDeals.map((d) => d.companyId).filter((id): id is string => !!id))
  );
  const [companyHistories, dealHistories] = await Promise.all([
    fetchPropertyHistories("companies", surfacedCompanyIds, SLT_COMPANY_PROPS),
    fetchPropertyHistories("deals", surfacedDeals.map((d) => d.dealId), SLT_DEAL_PROPS),
  ]);
  for (const deal of surfacedDeals) {
    deal.sinceLastTouch = buildSinceLastTouch(
      deal.companyId ? companyHistories.get(deal.companyId) : undefined,
      dealHistories.get(deal.dealId),
      deal.lastTouch,
      nowIso
    );
  }

  const [lifecycleDealsTotal, retentionDealsTotal, expansionDealsTotal] =
    await countsPromise;

  return {
    deals: meetingPrepDeals,
    meetings: meetingEntries,
    lifecycleDealsTotal,
    retentionDealsTotal,
    expansionDealsTotal,
  };
}

// Union of both pipelines' property lists — the meetings-first flow batch
// reads candidate deals before knowing which pipeline they belong to.
const ALL_MEETING_PREP_DEAL_PROPS = Array.from(
  new Set([...LIFECYCLE_DEAL_PROPS, ...RETENTION_DEAL_PROPS])
);

/**
 * Pool size for one pipeline scope via HubSpot's search `total` — a single
 * limit:1 request instead of paginating the full result set. The filters
 * exactly mirror the old full-pool searches so the count-tile numbers are
 * unchanged.
 */
async function countDealsInScope(
  scope: "lifecycle" | "retention" | "expansion",
  ownerIds: string[] | undefined
): Promise<number> {
  const filters: unknown[] =
    scope === "lifecycle"
      ? [
          { propertyName: "pipeline", operator: "EQ", value: LIFECYCLE_PIPELINE },
          { propertyName: "customer_stage", operator: "IN", values: ONBOARDING_STAGES },
        ]
      : scope === "retention"
      ? [
          { propertyName: "pipeline", operator: "EQ", value: RETENTION_PIPELINE },
          {
            propertyName: "customer_stage",
            operator: "NOT_IN",
            values: [...EXCLUDED_RETENTION_STAGES],
          },
        ]
      : [
          { propertyName: "pipeline", operator: "EQ", value: EXPANSION_PIPELINE },
          {
            propertyName: "dealstage",
            operator: "NOT_IN",
            values: [...EXCLUDED_EXPANSION_STAGES],
          },
        ];
  if (ownerIds && ownerIds.length > 0) {
    filters.push({ propertyName: "hubspot_owner_id", operator: "IN", values: ownerIds });
  }
  try {
    const page = await searchObjectsPage("deals", {
      filterGroups: [{ filters }],
      properties: ["hs_object_id"],
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 1,
    });
    return page.total;
  } catch {
    return 0; // count tiles degrade gracefully; the meeting list is unaffected
  }
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
  const isExpansion = dp.pipeline === EXPANSION_PIPELINE;
  const pipeline: MeetingPrepDeal["pipeline"] = isLifecycle
    ? "lifecycle"
    : isExpansion
    ? "expansion"
    : "retention";
  const expansionStageLabel = isExpansion
    ? EXPANSION_STAGE_LABELS[dp.dealstage || ""] ?? dp.dealstage ?? null
    : null;

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
  // Expansion deals don't fit this taxonomy at all (no customer_stage,
  // pipeline unrecognized) — skip it rather than let classifyPortfolioStage's
  // unrecognized-pipeline fallback silently mislabel them as "Adopted".
  const portfolioStage = isExpansion
    ? null
    : classifyPortfolioStage(
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
    expectedDaysInStep = EXPECTED_DAYS[step] ?? DEFAULT_EXPECTED_DAYS;

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
  } else if (!isExpansion && (portfolioStage === "Adopted" || portfolioStage === "Started")) {
    // Retention deal in a stuck-applicable stage: derive daysInStep from
    // hs_v2_date_entered_current_stage so stuck_in_step can fire for these
    // stages too (Portfolio already does this; Meeting Prep was missing it).
    const enteredStageDate = nullable(dp.hs_v2_date_entered_current_stage);
    if (enteredStageDate != null) {
      daysInStep = daysSince(enteredStageDate);
      expectedDaysInStep = RETENTION_EXPECTED_DAYS[portfolioStage] ?? null;
    }
  }

  // Expansion deals skip watch-out signals entirely — lightweight card for
  // now (deal name + raw stage only). None of the signal inputs below
  // (churn, health, stuck-in-step) map to an expansion-pipeline deal.
  const watchOuts: WatchOutSignal[] = isExpansion
    ? []
    : computeWatchOutSignals({
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
        // Non-null: this branch only runs when !isExpansion, and portfolioStage
        // is only ever null when isExpansion is true.
        stage: portfolioStage!,
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
    dealName: dp.dealname || "",
    companyId,
    companyName: cp.name || dp.dealname || "(unknown)",
    ownerId,
    ownerName,
    country: cp.understory_company_country || null,
    customerStage: dp.customer_stage || "",
    customerSubstage: dp.customer_substage || null,
    expansionStageLabel,
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
    sinceLastTouch: null, // filled for surfaced meetings in buildMeetingPrepPayload
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
  return {
    meetings: payload.meetings,
    dealsTotal:
      payload.lifecycleDealsTotal +
      payload.retentionDealsTotal +
      payload.expansionDealsTotal,
    lifecycleDealsTotal: payload.lifecycleDealsTotal,
    retentionDealsTotal: payload.retentionDealsTotal,
    expansionDealsTotal: payload.expansionDealsTotal,
    updatedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
  };
}
