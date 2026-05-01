import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { computeWatchOutSignals } from "./signals";
import type {
  OnboardingCommercial,
  OnboardingDeal,
  OnboardingEmailMessage,
  OnboardingHistoryEntry,
  OnboardingMeeting,
  OnboardingMeetingEntry,
  OnboardingObNotesExtended,
  OnboardingRisk,
  OnboardingStep,
  RetentionInvoiceState,
} from "./types";

// Parse the company's "upcoming events" health-score subfield. The HubSpot
// field is a 0-1 score, not a count: 0 = 0 events, 0.20 = 1 event, 0.40 = 2,
// ..., 1.00 = 5+ events. Returns the raw score so callers can both display
// the count and trigger the no_future_events watch-out (which fires only on
// score === 0).
function parseUpcomingEventsScore(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

// EUR conversion subset — mirrors retention.ts. Kept inline here to avoid an
// onboarding ↔ retention import cycle (retention.ts imports primitives from
// this file). Update both when adding a new currency.
const ONBOARDING_TO_EUR: Record<string, number> = {
  EUR: 1,
  SEK: 0.087,
  DKK: 0.134,
  NOK: 0.085,
  GBP: 1.18,
  USD: 0.92,
};

// Inline copy of retention.ts's extractInvoiceState — same logic, lives here
// so onboarding.ts doesn't need to import retention.ts (would be a cycle).
function extractInvoiceStateLocal(
  props: Record<string, string>,
  nowIso: string
): RetentionInvoiceState {
  const open = parseInt(props.number_of_open_invoices || "0", 10) || 0;
  const unpaid = props.unpaid_invoice === "true";
  const dueIso = props.invoice_due_date || "";
  const outstandingRaw = parseFloat(props.outstanding_amount || "0") || 0;
  const currency = (props.deal_currency_code || "EUR").toUpperCase();
  const rate = ONBOARDING_TO_EUR[currency] ?? 1;

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
    outstandingRaw > 0 ? Math.round(outstandingRaw * rate) : null;

  return { open, overdue, overdueDays, outstandingEur };
}

// Pipelines (from the verified mapping spec).
const LIFECYCLE_PIPELINE = "166333631";
const RETENTION_PIPELINE = "1072518362";
// Pipelines we accept when enriching an orphan meeting's brief: the onboarding
// lifecycle pipeline first, then customer retention for graduated customers.
const BRIEF_PIPELINES = [LIFECYCLE_PIPELINE, RETENTION_PIPELINE];
const SALES_PIPELINE = "81267902";

// customer_stage values that count as "still being onboarded".
// Ramp Up + Established are owned by the Retention dashboard, not this one.
const ONBOARDING_STAGES = ["Onboarding", "Adopted", "Started"];

const EXPECTED_DAYS: Record<OnboardingStep, number> = {
  Adopted: 14,
  Started: 30,
  Hibernation: 30,
  "Product Hold": 14,
  Other: 30,
};

function classifyStep(
  stage: string,
  substage: string | null,
  customerLiveDate: string | null
): OnboardingStep {
  if (substage) {
    const s = substage.toLowerCase();
    if (s.includes("hibernation")) return "Hibernation";
    if (s.includes("product hold") || s.includes("product_hold") || s.includes("hold")) {
      return "Product Hold";
    }
  }
  if (customerLiveDate) return "Started";
  if (stage === "Started") return "Started";
  if (stage === "Adopted" || stage === "Onboarding") return "Adopted";
  return "Other";
}

function computeRisk(
  step: OnboardingStep,
  daysInStep: number,
  blockers: string[]
): OnboardingRisk {
  if (step === "Hibernation" || step === "Product Hold") return "high";
  if (blockers.length > 0) return "high";
  const expected = EXPECTED_DAYS[step] ?? 30;
  if (daysInStep > expected * 1.5) return "high";
  if (daysInStep > expected) return "medium";
  return "low";
}

function nullable(v: string | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

// End-of-day timestamp for the Nth work day starting from `start` (counts
// `start` if it's a weekday). Used as the upper bound for meeting fetches
// so the default window is always exactly 5 working days regardless of
// whether today is Monday or Friday.
function endOfNthWorkDay(start: Date, n: number): Date {
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
  return cursor;
}

function parseEnableUnderstoryPay(v: string | undefined): boolean | null {
  if (v == null || v === "") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function formatBookingFee(
  bookingFee: string | undefined,
  confirmedBookingFee: string | undefined
): string | null {
  // Confirmed booking fee overrides the raw value when present; both are decimals
  // (e.g. 0.025 = 2.5%).
  const raw = confirmedBookingFee ?? bookingFee;
  if (raw == null || raw === "") return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  const pct = n < 1 ? n * 100 : n;
  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function formatMonthlyFee(
  amount: string | undefined,
  currency: string | undefined
): string | null {
  if (amount == null || amount === "") return null;
  const n = parseFloat(amount);
  if (isNaN(n) || n === 0) return null;
  if (!currency || !currency.trim()) return null;
  return `${Math.round(n).toLocaleString("en-US")} ${currency.trim().toUpperCase()}/mo`;
}

function formatAcv(amount: string | undefined): string | null {
  if (amount == null || amount === "") return null;
  const n = parseFloat(amount);
  if (isNaN(n) || n === 0) return null;
  return `${Math.round(n).toLocaleString("en-US")} EUR`;
}

function formatFirstBilling(date: string | undefined): string | null {
  if (date == null || date === "") return null;
  // The HubSpot date field comes back as either YYYY-MM-DD or an ISO timestamp.
  const trimmed = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
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
  "deal_currency_code",
  "subscription_plan",
  "hubspot_owner_id",
  "self_onboarding",
  // OB Notes (Lookup 2)
  "enable_understory_pay",
  "understory_pay_status__customer",
  "storefront",
  "ob_note___customer_needs_",
  "ob_note___promises_made",
  "ob_note___link_to_experience_s__that_need_to_be_created_",
  "ob_note___grow_notes__if_booked_",
  // Commercial (Lookup 2)
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
  // Invoice (Retention backport)
  "number_of_open_invoices",
  "unpaid_invoice",
  "invoice_due_date",
  "outstanding_amount",
];

const SALES_DEAL_PROPS = [
  "dealname",
  "pipeline",
  "createdate",
  "deal_currency_code",
  "core_net_price__local_currency",
  "test_billing_start_date",
  "hubspot_owner_id",
];

export const MEETING_PROPS = [
  "hs_meeting_title",
  "hs_meeting_start_time",
  "hs_meeting_end_time",
  "hs_meeting_body",
  "hs_internal_meeting_notes",
  "hs_meeting_outcome",
  "hs_activity_type",
  "hubspot_owner_id",
];

/** hs_activity_type values that mean "this meeting kicks off onboarding". */
export const ONBOARDING_MEETING_TYPES = new Set([
  "Onboarding",
  "Bloom Onboarding",
  "Grow onboarding meeting",
]);

export function isOnboardingMeeting(activityType: string | null | undefined): boolean {
  if (!activityType) return false;
  return ONBOARDING_MEETING_TYPES.has(activityType);
}

const CALL_PROPS = [
  "hs_call_title",
  "hs_call_body",
  "hs_call_status",
  "hs_call_disposition",
  "hs_timestamp",
  "hubspot_owner_id",
];

const EMAIL_PROPS = [
  "hs_email_subject",
  "hs_email_text",
  "hs_email_html",
  "hs_email_direction",
  "hs_email_status",
  "hs_timestamp",
  "hubspot_owner_id",
];

/** Subjects/titles that mean "calendar response", not a real engagement. */
const NOISE_PREFIXES = [
  "accepted:",
  "tentative:",
  "tentatively accepted:",
  "declined:",
  "canceled:",
  "cancelled:",
  "rescheduled:",
  "re: accepted:",
  "re: declined:",
  "re: tentative:",
];

function isNoisySubject(s: string | null | undefined): boolean {
  if (!s) return false;
  const norm = s.toLowerCase().trim();
  return NOISE_PREFIXES.some((p) => norm.startsWith(p));
}

function isMeaningfulMeeting(title: string, body: string | null, internalNotes: string | null): boolean {
  if ((title || "").toLowerCase().includes("[gong]")) return true;
  if (body && body.trim().length > 30) return true;
  if (internalNotes && internalNotes.trim().length > 0) return true;
  return false;
}

function isGongMeeting(title: string, body: string | null): boolean {
  if ((title || "").toLowerCase().includes("[gong]")) return true;
  if (body && /Call highlights by Gong/i.test(body)) return true;
  return false;
}

/** Strip reply / forward prefixes in EN, DA, SV, NO, DE, FR, NL, ES so we can group threads. */
function normaliseEmailSubject(raw: string): string {
  let s = raw.trim();
  // Repeat-strip prefixes like "Re: Re: Sv: ..." in any order.
  for (let i = 0; i < 8; i++) {
    const stripped = s.replace(
      /^\s*(re|fw|fwd|sv|vs|antw|antwort|tr|rv|aw|wg|fae|vl|videresend)[:\s][:\s]*/i,
      ""
    );
    if (stripped === s) break;
    s = stripped;
  }
  return s.trim().toLowerCase();
}

/**
 * Drop bare meeting invitations and collapse calendar+Gong duplicates.
 * Pairs that fall within a 10-minute window on the same deal are considered
 * the "same meeting"; we keep the Gong-tagged one.
 */
function dedupMeetings(meetings: OnboardingMeeting[]): OnboardingMeeting[] {
  // Sort by start time ASC for adjacency checks.
  const sorted = [...meetings].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const drop = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    if (drop.has(sorted[i].id)) continue;
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      const dt = Math.abs(new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
      if (dt > 10 * 60 * 1000) break; // sorted, no need to continue
      const aIsGong = isGongMeeting(a.title, a.body);
      const bIsGong = isGongMeeting(b.title, b.body);
      if (aIsGong && !bIsGong) {
        drop.add(b.id);
      } else if (bIsGong && !aIsGong) {
        drop.add(a.id);
        break; // a is dropped, no further comparison
      }
      // If both Gong or neither Gong, leave both alone.
    }
  }
  return sorted.filter((m) => !drop.has(m.id));
}

/** Collapse emails by normalised subject into one thread entry per group. */
function groupEmailsByThread(emails: OnboardingHistoryEntry[]): OnboardingHistoryEntry[] {
  if (emails.length === 0) return [];
  const groups = new Map<string, OnboardingHistoryEntry[]>();
  for (const e of emails) {
    const key = normaliseEmailSubject(e.title);
    const arr = groups.get(key) || [];
    arr.push(e);
    groups.set(key, arr);
  }
  const out: OnboardingHistoryEntry[] = [];
  for (const [, list] of groups) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const head = list[list.length - 1]; // most recent
    const thread: OnboardingEmailMessage[] = list.map((m) => ({
      id: m.id,
      occurredAt: m.occurredAt,
      body: m.body ?? "",
      direction: m.direction,
      ownerName: m.ownerName,
    }));
    out.push({
      id: `thread:${head.id}`,
      kind: "email",
      title: head.title.replace(/^\s*(re|fw|fwd|sv|vs|antw|antwort|tr|rv|aw|wg|fae|vl|videresend)[:\s][:\s]*/i, "").trim() || head.title,
      occurredAt: head.occurredAt,
      body: head.body,
      ownerId: head.ownerId,
      ownerName: head.ownerName,
      direction: head.direction,
      outcome: null,
      thread,
    });
  }
  return out;
}

export interface RawObject {
  id: string;
  properties: Record<string, string>;
}

// Process-wide cache for the owner directory. The HubSpot owners endpoint
// returns the full list (~5-20 names) regardless of the IDs we pass — the
// `ownerIds` arg here only existed to short-circuit when none were needed.
// Owners change rarely, and the previous shape made this function get called
// 4-5 times per `/api/onboarding` request, paying ~150ms each. Cache for
// 10 minutes; the in-flight promise dedupe collapses concurrent callers.
let ownerCacheData: Record<string, string> | null = null;
let ownerCacheAt = 0;
let ownerInflight: Promise<Record<string, string>> | null = null;
const OWNER_TTL_MS = 10 * 60 * 1000;

export async function fetchOwnerNames(ownerIds: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ownerIds.filter(Boolean)));
  if (unique.length === 0) return {};

  if (ownerCacheData && Date.now() - ownerCacheAt < OWNER_TTL_MS) {
    return ownerCacheData;
  }
  if (ownerInflight) return ownerInflight;

  ownerInflight = (async () => {
    try {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/owners?limit=200`, {
        headers: hubspotHeaders(),
        cache: "no-store" as RequestCache,
      });
      if (!res.ok) return {};
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const o of data.results || []) {
        const id = String(o.id);
        const name = `${o.firstName || ""} ${o.lastName || ""}`.trim() || o.email || "Unknown";
        map[id] = name;
      }
      ownerCacheData = map;
      ownerCacheAt = Date.now();
      return map;
    } catch {
      return {};
    } finally {
      ownerInflight = null;
    }
  })();
  return ownerInflight;
}

async function fetchLifecycleDeals(ownerIds?: string[]): Promise<RawObject[]> {
  const out: RawObject[] = [];
  let after: string | undefined;
  // When `ownerIds` is provided we filter at the search level so the per-deal
  // enrichment loop only runs for deals the user is actually viewing — the
  // main speedup for region/person filters.
  const ownerFilter = ownerIds && ownerIds.length > 0
    ? [{ propertyName: "hubspot_owner_id", operator: "IN", values: ownerIds }]
    : [];
  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: LIFECYCLE_PIPELINE },
            { propertyName: "customer_stage", operator: "IN", values: ONBOARDING_STAGES },
            ...ownerFilter,
          ],
        },
      ],
      properties: LIFECYCLE_DEAL_PROPS,
      limit: 100,
    };
    if (after) body.after = after;

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const data = await res.json();
    out.push(...(data.results || []));
    after = data.paging?.next?.after;
  } while (after);
  return out;
}

export interface BatchAssoc {
  fromId: string;
  toIds: string[];
}

export async function fetchAssociations(
  fromObject: string,
  toObject: string,
  fromIds: string[]
): Promise<BatchAssoc[]> {
  // Parallelize batches of 50 — same reasoning as fetchObjectsBatch above.
  const batches: string[][] = [];
  for (let i = 0; i < fromIds.length; i += 50) batches.push(fromIds.slice(i, i + 50));
  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await fetch(
          `${HUBSPOT_API}/crm/v4/associations/${fromObject}/${toObject}/batch/read`,
          {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
          }
        );
        if (!res.ok) return [] as BatchAssoc[];
        const data = await res.json();
        const items: BatchAssoc[] = [];
        for (const result of data.results || []) {
          const fromId = String(result.from?.id ?? "");
          const toIds = (result.to || []).map((t: { toObjectId: number | string }) => String(t.toObjectId));
          if (fromId) items.push({ fromId, toIds });
        }
        return items;
      } catch {
        return [] as BatchAssoc[];
      }
    })
  );
  return results.flat();
}

export async function fetchObjectsBatch(
  objectType: string,
  ids: string[],
  properties: string[]
): Promise<Map<string, Record<string, string>>> {
  const out = new Map<string, Record<string, string>>();
  // HubSpot caps batch reads at 100 IDs per request. Fire batches in parallel —
  // sequential awaits used to dominate the onboarding fetch when a single deal
  // had 100s of associated meetings/emails.
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
  const results = await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/${objectType}/batch/read`, {
          method: "POST",
          headers: hubspotHeaders(),
          body: JSON.stringify({ inputs: batch.map((id) => ({ id })), properties }),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []) as Array<{ id: string; properties?: Record<string, string> }>;
      } catch {
        return [];
      }
    })
  );
  for (const batchResults of results) {
    for (const o of batchResults) {
      out.set(String(o.id), o.properties || {});
    }
  }
  return out;
}

export async function fetchSalesDealsForCompanies(companyIds: string[]): Promise<Map<string, RawObject[]>> {
  // Map companyId → sorted list of sales pipeline deals (most recent first).
  //
  // Why associations + batch-read instead of `/deals/search`: the search
  // endpoint with `associatedWith` is fundamentally slow (1-3s per page,
  // paginates sequentially within a batch). The associations endpoint is
  // ~100ms per batch of 100 IDs and parallelizes cleanly. Same pattern as
  // `fetchZeroEventDealIds` in pay-migration.ts (which dropped that path
  // from ~11s to ~2s when we switched).
  const dealsByCompany = new Map<string, RawObject[]>();
  if (companyIds.length === 0) return dealsByCompany;

  // Step 1: company → deal IDs via batch associations (parallel, fast).
  const companyDealAssocs = await fetchAssociations("companies", "deals", companyIds);
  const companyToDealIds = new Map<string, string[]>();
  const allDealIds = new Set<string>();
  for (const a of companyDealAssocs) {
    companyToDealIds.set(a.fromId, a.toIds);
    for (const id of a.toIds) allDealIds.add(id);
  }
  if (allDealIds.size === 0) return dealsByCompany;

  // Step 2: batch-read deal properties (parallel, fast). Filter to sales
  // pipeline in memory — typically a small subset of total deals.
  const dealProps = await fetchObjectsBatch(
    "deals",
    Array.from(allDealIds),
    SALES_DEAL_PROPS
  );

  // Step 3: regroup by company, keeping only sales-pipeline deals.
  for (const [companyId, dealIds] of companyToDealIds) {
    const sales: RawObject[] = [];
    for (const did of dealIds) {
      const props = dealProps.get(did);
      if (!props) continue;
      if (props.pipeline !== SALES_PIPELINE) continue;
      sales.push({ id: did, properties: props });
    }
    if (sales.length > 0) dealsByCompany.set(companyId, sales);
  }

  // Sort each company's deal list by createdate DESC.
  for (const [, list] of dealsByCompany) {
    list.sort((a, b) =>
      (b.properties.createdate || "").localeCompare(a.properties.createdate || "")
    );
  }
  return dealsByCompany;
}

export function pickSalesFallback(
  salesDeals: RawObject[]
): { deal: RawObject; isPriced: boolean } | null {
  if (salesDeals.length === 0) return null;
  const priced = salesDeals.find(
    (d) => nullable(d.properties.core_net_price__local_currency) != null
  );
  if (priced) return { deal: priced, isPriced: true };
  return { deal: salesDeals[0], isPriced: false };
}

async function fetchMeetingsForDeals(
  dealIds: string[]
): Promise<Map<string, OnboardingMeeting[]>> {
  const result = new Map<string, OnboardingMeeting[]>();
  if (dealIds.length === 0) return result;

  const dealAssocs = await fetchAssociations("deals", "meetings", dealIds);
  const dealToMeetingIds = new Map<string, string[]>();
  for (const a of dealAssocs) dealToMeetingIds.set(a.fromId, a.toIds);

  const allMeetingIds = Array.from(new Set(Array.from(dealToMeetingIds.values()).flat()));
  if (allMeetingIds.length === 0) return result;

  const meetingProps = await fetchObjectsBatch("meetings", allMeetingIds, MEETING_PROPS);

  const ownerIds = new Set<string>();
  for (const props of meetingProps.values()) {
    if (props.hubspot_owner_id) ownerIds.add(props.hubspot_owner_id);
  }
  const ownerNames = await fetchOwnerNames(Array.from(ownerIds));

  for (const [dealId, meetingIds] of dealToMeetingIds) {
    const meetings: OnboardingMeeting[] = [];
    for (const mid of meetingIds) {
      const props = meetingProps.get(mid);
      if (!props) continue;
      const startsAt = nullable(props.hs_meeting_start_time);
      if (!startsAt) continue;
      const ownerId = props.hubspot_owner_id || "";
      meetings.push({
        id: mid,
        title: nullable(props.hs_meeting_title) ?? "(Untitled meeting)",
        startsAt,
        endsAt: nullable(props.hs_meeting_end_time),
        body: nullable(props.hs_meeting_body),
        internalNotes: nullable(props.hs_internal_meeting_notes),
        outcome: nullable(props.hs_meeting_outcome),
        activityType: nullable(props.hs_activity_type),
        ownerId,
        ownerName: ownerId ? (ownerNames[ownerId] ?? null) : null,
      });
    }
    if (meetings.length > 0) result.set(dealId, meetings);
  }
  return result;
}

/**
 * Pulls every meeting owned by the given CS owners that starts in [fromIso, toIso),
 * regardless of which pipeline the associated deal sits in. Lets us catch meetings
 * on sales-pipeline deals (or unassociated meetings) that the deal-first fetch misses.
 */
export async function fetchUpcomingMeetingsByOwners(
  ownerIds: string[],
  fromIso: string,
  toIso: string
): Promise<RawObject[]> {
  if (ownerIds.length === 0) return [];
  const out: RawObject[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [
        {
          filters: [
            { propertyName: "hubspot_owner_id", operator: "IN", values: ownerIds },
            { propertyName: "hs_meeting_start_time", operator: "GTE", value: fromIso },
            { propertyName: "hs_meeting_start_time", operator: "LT", value: toIso },
          ],
        },
      ],
      properties: MEETING_PROPS,
      sorts: [{ propertyName: "hs_meeting_start_time", direction: "ASCENDING" }],
      limit: 200,
    };
    if (after) body.after = after;
    try {
      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/meetings/search`, {
        method: "POST",
        headers: hubspotHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) break;
      const data = await res.json();
      out.push(...(data.results || []));
      after = data.paging?.next?.after;
    } catch {
      break;
    }
  } while (after);
  return out;
}

async function fetchCallsForDeals(
  dealIds: string[]
): Promise<Map<string, OnboardingHistoryEntry[]>> {
  const result = new Map<string, OnboardingHistoryEntry[]>();
  if (dealIds.length === 0) return result;
  const assocs = await fetchAssociations("deals", "calls", dealIds);
  const dealToIds = new Map<string, string[]>();
  for (const a of assocs) dealToIds.set(a.fromId, a.toIds);
  const allIds = Array.from(new Set(Array.from(dealToIds.values()).flat()));
  if (allIds.length === 0) return result;

  const props = await fetchObjectsBatch("calls", allIds, CALL_PROPS);
  const ownerIds = new Set<string>();
  for (const p of props.values()) if (p.hubspot_owner_id) ownerIds.add(p.hubspot_owner_id);
  const ownerNames = await fetchOwnerNames(Array.from(ownerIds));

  for (const [dealId, ids] of dealToIds) {
    const entries: OnboardingHistoryEntry[] = [];
    for (const id of ids) {
      const p = props.get(id);
      if (!p) continue;
      const occurredAt = nullable(p.hs_timestamp);
      if (!occurredAt) continue;
      const title = nullable(p.hs_call_title) ?? "(Logged call)";
      if (isNoisySubject(title)) continue;
      const ownerId = p.hubspot_owner_id || "";
      entries.push({
        id,
        kind: "call",
        title,
        occurredAt,
        body: nullable(p.hs_call_body),
        ownerId,
        ownerName: ownerId ? (ownerNames[ownerId] ?? null) : null,
        direction: null,
        outcome: nullable(p.hs_call_disposition) ?? nullable(p.hs_call_status),
      });
    }
    if (entries.length > 0) result.set(dealId, entries);
  }
  return result;
}

async function fetchEmailsForDeals(
  dealIds: string[]
): Promise<Map<string, OnboardingHistoryEntry[]>> {
  const result = new Map<string, OnboardingHistoryEntry[]>();
  if (dealIds.length === 0) return result;
  const assocs = await fetchAssociations("deals", "emails", dealIds);
  const dealToIds = new Map<string, string[]>();
  for (const a of assocs) dealToIds.set(a.fromId, a.toIds);
  const allIds = Array.from(new Set(Array.from(dealToIds.values()).flat()));
  if (allIds.length === 0) return result;

  const props = await fetchObjectsBatch("emails", allIds, EMAIL_PROPS);
  const ownerIds = new Set<string>();
  for (const p of props.values()) if (p.hubspot_owner_id) ownerIds.add(p.hubspot_owner_id);
  const ownerNames = await fetchOwnerNames(Array.from(ownerIds));

  for (const [dealId, ids] of dealToIds) {
    const entries: OnboardingHistoryEntry[] = [];
    for (const id of ids) {
      const p = props.get(id);
      if (!p) continue;
      const occurredAt = nullable(p.hs_timestamp);
      if (!occurredAt) continue;
      const title = nullable(p.hs_email_subject) ?? "(Email)";
      if (isNoisySubject(title)) continue;
      const body = nullable(p.hs_email_text) ?? nullable(p.hs_email_html);
      if (!body || body.trim().length < 10) continue; // skip empties / one-liners
      const dirRaw = (p.hs_email_direction || "").toUpperCase();
      const direction: OnboardingHistoryEntry["direction"] =
        dirRaw === "INCOMING_EMAIL" || dirRaw === "INBOUND"
          ? "INBOUND"
          : dirRaw === "EMAIL" || dirRaw === "FORWARDED_EMAIL" || dirRaw === "OUTBOUND"
            ? "OUTBOUND"
            : null;
      const ownerId = p.hubspot_owner_id || "";
      entries.push({
        id,
        kind: "email",
        title,
        occurredAt,
        body,
        ownerId,
        ownerName: ownerId ? (ownerNames[ownerId] ?? null) : null,
        direction,
        outcome: null,
      });
    }
    if (entries.length > 0) result.set(dealId, entries);
  }
  return result;
}

interface CompanyInfo {
  companyId: string;
  name: string;
  country: string | null;
  domain: string | null;
  // Raw company props bag — surfaced in the watch-out computation. Keeping it
  // here lets the onboarding deal builder use the same volume/health/events
  // fields the Retention brief reads from companyProps.
  props: Record<string, string>;
}

async function fetchCompaniesForDeals(
  dealIds: string[]
): Promise<Map<string, CompanyInfo>> {
  const dealAssocs = await fetchAssociations("deals", "companies", dealIds);
  const dealToCompany = new Map<string, string>();
  for (const a of dealAssocs) if (a.toIds[0]) dealToCompany.set(a.fromId, a.toIds[0]);

  const uniqueCompanyIds = Array.from(new Set(dealToCompany.values()));
  const companyProps = await fetchObjectsBatch("companies", uniqueCompanyIds, [
    "name",
    "understory_company_country",
    "domain",
    "notes_last_contacted",
    // Watch-out signals (volume / health / events). Same set the retention
    // dashboard pulls — we surface them in the onboarding brief too.
    "understory_booking_volume_3m",
    "understory_booking_volume_6m",
    "health_score",
    "understory_health_score_upcoming_events",
  ]);

  const out = new Map<string, CompanyInfo>();
  for (const [dealId, companyId] of dealToCompany) {
    const props = companyProps.get(companyId);
    if (!props) continue;
    out.set(dealId, {
      companyId,
      name: props.name || "Unknown",
      country: nullable(props.understory_company_country),
      domain: nullable(props.domain),
      props,
    });
  }
  return out;
}

export interface ContactInfo {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

export async function fetchPrimaryContactsForDeals(
  dealIds: string[]
): Promise<Map<string, ContactInfo>> {
  const dealAssocs = await fetchAssociations("deals", "contacts", dealIds);
  const dealToContact = new Map<string, string>();
  for (const a of dealAssocs) if (a.toIds[0]) dealToContact.set(a.fromId, a.toIds[0]);

  const uniqueContactIds = Array.from(new Set(dealToContact.values()));
  // Email + phone surface on the meeting brief and detail header so the CS
  // owner has the customer-side contact at a click. Mobile-phone preferred,
  // fall back to landline below.
  const contactProps = await fetchObjectsBatch("contacts", uniqueContactIds, [
    "firstname",
    "lastname",
    "email",
    "mobilephone",
    "phone",
  ]);

  const out = new Map<string, ContactInfo>();
  for (const [dealId, contactId] of dealToContact) {
    const props = contactProps.get(contactId);
    if (!props) continue;
    out.set(dealId, {
      firstName: nullable(props.firstname),
      lastName: nullable(props.lastname),
      email: nullable(props.email),
      phone: nullable(props.mobilephone) ?? nullable(props.phone),
    });
  }
  return out;
}

interface OnboardingPayload {
  deals: OnboardingDeal[];
  meetings: OnboardingMeetingEntry[];
}

/**
 * @param opts.ownerIds — when set, only deals owned by these CS owners are
 *                        fetched. Saves the per-deal enrichment cost when the
 *                        user is filtered down to a region or single person.
 * @param opts.meetingFromIso / meetingToIso — overrides the default
 *   today→endOfNthWorkDay(today, 5) meeting window. Used by the per-day
 *   endpoint to fetch a single day outside the default window.
 */
export async function buildOnboardingPayload(
  opts: {
    ownerIds?: string[];
    meetingFromIso?: string;
    meetingToIso?: string;
    spans?: import("./perf").Spans;
  } = {}
): Promise<OnboardingPayload> {
  const spans = opts.spans;
  const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    if (!spans) return fn();
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      spans.push({ label, ms: performance.now() - t0 });
    }
  };

  const lifecycleDeals = await time("hubspot.lifecycleDeals", () =>
    fetchLifecycleDeals(opts.ownerIds)
  );
  if (lifecycleDeals.length === 0) {
    return { deals: [], meetings: [] };
  }

  const dealIds = lifecycleDeals.map((d) => d.id);
  // CS owner IDs are knowable as soon as lifecycle deals land. Compute now so
  // we can fire the orphan-meetings calendar fetch in parallel with the main
  // companies/meetings/contacts block instead of waiting for it.
  const lifecycleOwnerIds = lifecycleDeals.map((d) => d.properties.hubspot_owner_id).filter(Boolean);
  const csOwnerIds = opts.ownerIds && opts.ownerIds.length > 0
    ? opts.ownerIds
    : Array.from(new Set(lifecycleOwnerIds));

  // Meetings window: today + the next 4 work days (5 work days total) by
  // default. Days outside this window are fetched on-demand via the per-day
  // endpoint. Defining bounds early so the parallel fetches can use them.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const meetingFrom = opts.meetingFromIso ? new Date(opts.meetingFromIso) : today;
  const meetingHorizon = opts.meetingToIso
    ? new Date(opts.meetingToIso)
    : endOfNthWorkDay(today, 5);

  // Kick the four independent fetches concurrently. The fifth — salesDeals —
  // depends on `companyMap` for its company-id list, but we don't need to
  // wait for the whole parallel block before starting it. Chain salesDeals
  // off the companies promise so it begins ~800ms earlier than it would if
  // we awaited the whole block first.
  const companiesPromise = time("hubspot.companies", () =>
    fetchCompaniesForDeals(dealIds)
  );
  const meetingsPromise = time("hubspot.meetings", () =>
    fetchMeetingsForDeals(dealIds)
  );
  const contactsPromise = time("hubspot.contacts", () =>
    fetchPrimaryContactsForDeals(dealIds)
  );
  const ownerMeetingsPromise =
    csOwnerIds.length > 0
      ? time("hubspot.ownerMeetings", () =>
          fetchUpcomingMeetingsByOwners(
            csOwnerIds,
            meetingFrom.toISOString(),
            meetingHorizon.toISOString()
          )
        )
      : Promise.resolve([]);
  const salesDealsPromise = companiesPromise.then((companyMap) => {
    const companyIds = Array.from(
      new Set(Array.from(companyMap.values()).map((c) => c.companyId))
    );
    return time("hubspot.salesDeals", () => fetchSalesDealsForCompanies(companyIds));
  });

  const [companyMap, meetingsByDeal, contactMap, ownerDirect, salesDealsByCompany] =
    await Promise.all([
      companiesPromise,
      meetingsPromise,
      contactsPromise,
      ownerMeetingsPromise,
      salesDealsPromise,
    ]);

  // Owner names — fetchOwnerNames is now request-cached so we only pay this
  // once per request. Subsequent callers (e.g. inside the orphan flow) hit
  // the cache instantly.
  const salesOwnerIds: string[] = [];
  for (const list of salesDealsByCompany.values()) {
    for (const d of list) if (d.properties.hubspot_owner_id) salesOwnerIds.push(d.properties.hubspot_owner_id);
  }
  const ownerNames = await fetchOwnerNames([...lifecycleOwnerIds, ...salesOwnerIds]);

  // Build deals with full brief.
  // (today / meetingFrom / meetingHorizon were defined earlier so they could
  // be used by the parallel ownerMeetings fetch above.)
  const meetings: OnboardingMeetingEntry[] = [];

  const deals: OnboardingDeal[] = lifecycleDeals.map((d) => {
    const p = d.properties;
    const stage = p.customer_stage || "";
    const substage = nullable(p.customer_substage);
    const customerLiveDate = nullable(p.customer_live_date) ?? nullable(p.customer_live);
    const step = classifyStep(stage, substage, customerLiveDate);

    const enteredStageDate = nullable(p.hs_v2_date_entered_current_stage);
    const daysInStep =
      enteredStageDate != null ? daysSince(enteredStageDate) : daysSince(nullable(p.createdate));

    const hibernationNote = nullable(p.hibernation_notes);
    const productHoldNote = nullable(p.product_hold_note);
    const blockers: string[] = [];
    if (productHoldNote) blockers.push(`Product hold: ${productHoldNote}`);
    if (hibernationNote) blockers.push(`Hibernation: ${hibernationNote}`);

    const company = companyMap.get(d.id);
    const contact = contactMap.get(d.id);
    const contactName = contact
      ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() || null
      : null;

    const obNotes: OnboardingObNotesExtended = {
      understoryPayEnabled: parseEnableUnderstoryPay(p.enable_understory_pay),
      contactEmail: contact?.email ?? null,
      contactPhone: contact?.phone ?? null,
      customerNeeds: nullable(p["ob_note___customer_needs_"]),
      promisesMade: nullable(p["ob_note___promises_made"]),
      experiencesLink: nullable(p["ob_note___link_to_experience_s__that_need_to_be_created_"]),
      growNotes: nullable(p["ob_note___grow_notes__if_booked_"]),
      contactName,
      companyDomain: company?.domain ?? null,
      storefrontLink: nullable(p.storefront),
      payStatus: nullable(p.understory_pay_status__customer),
    };

    // Commercial — Lookup 2 lifecycle deal first.
    let firstBilling = formatFirstBilling(p.test_billing_start_date);
    let salesOwnerName: string | null = null;

    // Lookup 3 — fallback to sales deal when test_billing_start_date is empty.
    if (firstBilling == null && company) {
      const fallback = pickSalesFallback(salesDealsByCompany.get(company.companyId) ?? []);
      if (fallback) {
        firstBilling = formatFirstBilling(fallback.deal.properties.test_billing_start_date);
        // Lookup 4 — sales owner name from the priced fallback (or any sales deal as 2nd fallback).
        const sownerId = fallback.deal.properties.hubspot_owner_id;
        if (sownerId) salesOwnerName = ownerNames[sownerId] ?? null;
      }
    } else if (company) {
      // Even when lifecycle has the billing date, attribute a sales owner if any sales deal exists.
      const fallback = pickSalesFallback(salesDealsByCompany.get(company.companyId) ?? []);
      const sownerId = fallback?.deal.properties.hubspot_owner_id;
      if (sownerId) salesOwnerName = ownerNames[sownerId] ?? null;
    }
    if (salesOwnerName == null) salesOwnerName = "missing";

    // Monthly fee — prefer the priced sales deal as the source of truth, since
    // lifecycle deals often inherit a default currency (EUR) regardless of the
    // actual deal currency. Fall back to the lifecycle deal only when no priced
    // sales deal exists.
    let feeAmount: string | undefined = p.core_net_price__local_currency;
    let feeCurrency: string | undefined = p.deal_currency_code;
    if (company) {
      const priced = pickSalesFallback(salesDealsByCompany.get(company.companyId) ?? []);
      if (priced?.isPriced) {
        feeAmount = priced.deal.properties.core_net_price__local_currency;
        feeCurrency = priced.deal.properties.deal_currency_code;
      }
    }

    const commercial: OnboardingCommercial = {
      monthlyFee: formatMonthlyFee(feeAmount, feeCurrency),
      acv: formatAcv(p.amount_in_home_currency),
      bookingFee: formatBookingFee(p.booking_fee, p.confirmed_booking_fee),
      firstBilling,
      salesOwner: salesOwnerName,
    };

    const ownerId = p.hubspot_owner_id || "";
    // ACV — already in the home currency (EUR) thanks to amount_in_home_currency.
    const acv = Math.round(parseFloat(p.amount_in_home_currency || "0") || 0);

    // All meetings (used for upcoming bucket + history). De-dupe calendar+Gong
    // pairs so we don't show "DSC x Understory" alongside "[Gong] DSC x Understory".
    const allMeetings = dedupMeetings(meetingsByDeal.get(d.id) ?? []);
    allMeetings.sort((a, b) => b.startsAt.localeCompare(a.startsAt));

    // History: meaningful past meetings + calls + thread-grouped emails.
    const meetingHistory: OnboardingHistoryEntry[] = [];
    for (const m of allMeetings) {
      const t = new Date(m.startsAt).getTime();
      if (isNaN(t) || t >= today.getTime()) continue;
      if (!isMeaningfulMeeting(m.title, m.body, m.internalNotes)) continue;
      if (isNoisySubject(m.title)) continue;
      meetingHistory.push({
        id: m.id,
        kind: "meeting",
        title: m.title,
        occurredAt: m.startsAt,
        body: m.body,
        ownerId: m.ownerId,
        ownerName: m.ownerName,
        direction: null,
        outcome: m.outcome,
      });
    }

    // Calls + emails are deferred to /api/onboarding/history. The list payload
    // ships only meeting-derived history so the meeting-prep view has something
    // to render immediately while the heavier history backfills.
    const history = [...meetingHistory].sort(
      (a, b) => b.occurredAt.localeCompare(a.occurredAt)
    );

    // Retention backports — invoice state, future events, and watch-out signals
    // are now surfaced in the onboarding brief too. The shared helpers live in
    // retention.ts (extractInvoiceState) and signals.ts (computeWatchOutSignals).
    const nowIsoForDeal = new Date().toISOString();
    const invoices = extractInvoiceStateLocal(p, nowIsoForDeal);
    const cp = company?.props ?? {};
    const futureEvents = parseUpcomingEventsScore(cp.understory_health_score_upcoming_events);
    const expectedDaysInStep = EXPECTED_DAYS[step] ?? 30;
    const watchOuts = computeWatchOutSignals({
      nowIso: nowIsoForDeal,
      unpaidInvoice: p.unpaid_invoice === "true",
      invoiceDueDate: p.invoice_due_date || null,
      outstandingEur: invoices.outstandingEur,
      overdueDays: invoices.overdueDays,
      wishToChurn: p.wish_to_churn === "true",
      churnReason: p.churn_reason || null,
      volume3m: parseFloat(cp.understory_booking_volume_3m || "0") || 0,
      volume6m: parseFloat(cp.understory_booking_volume_6m || "0") || 0,
      healthScore: parseFloat(cp.health_score || "") || null,
      upcomingEvents: futureEvents,
      notesLastContacted: cp.notes_last_contacted || p.notes_last_contacted || null,
      daysInStep,
      expectedDaysInStep,
    });

    const deal: OnboardingDeal = {
      dealId: d.id,
      companyId: company?.companyId ?? null,
      companyName: company?.name ?? p.dealname?.replace(" Customer Lifecycle deal", "") ?? "Unknown",
      ownerId,
      ownerName: ownerNames[ownerId] || "Unassigned",
      country: company?.country ?? null,
      plan: nullable(p.subscription_plan),
      acv,
      signedAt: nullable(p.createdate),
      step,
      customerStage: stage,
      customerSubstage: substage,
      daysInStep,
      expectedDaysInStep,
      riskLevel: computeRisk(step, daysInStep, blockers),
      blockers,
      hibernationNote,
      productHoldNote,
      obNotes,
      commercial,
      selfOnboarding: p.self_onboarding === "true",
      lastTouch: nullable(p.notes_last_contacted),
      history,
      invoices,
      futureEvents,
      watchOuts,
    };

    // Slot meetings inside the configured window into the flat list.
    for (const m of allMeetings) {
      const t = new Date(m.startsAt).getTime();
      if (!isNaN(t) && t >= meetingFrom.getTime() && t < meetingHorizon.getTime()) {
        meetings.push({ meeting: m, deal });
      }
    }
    return deal;
  });

  // Catch meetings owned by CS owners that aren't associated with any of our
  // lifecycle deals (typically meetings on sales-pipeline deals or one-offs).
  // We render these with a stub deal so they still appear on the day strip.
  // When the caller supplied an owner filter, restrict the orphan-meeting
  // sweep to those owners too — otherwise we'd undo the speedup by pulling
  // every CS owner's calendar. (csOwnerIds + ownerDirect were computed
  // earlier so the calendar fetch could overlap with the main parallel block.)
  if (csOwnerIds.length > 0) {
    const knownMeetingIds = new Set<string>();
    for (const list of meetingsByDeal.values()) {
      for (const m of list) knownMeetingIds.add(m.id);
    }

    const orphans = ownerDirect.filter((m) => !knownMeetingIds.has(m.id));
    if (orphans.length > 0) {
      const orphanT0 = performance.now();
      const orphanIds = orphans.map((m) => m.id);

      // Fire meetings→companies and meetings→contacts in parallel. Many
      // Gong-imported meetings only carry a contact link, not a company link,
      // so we always need the contact path. Doing them concurrently overlaps
      // ~150-200ms vs the previous "do A, then maybe do B" sequence.
      const [meetingCompanyAssocs, meetingContactAssocs] = await Promise.all([
        fetchAssociations("meetings", "companies", orphanIds),
        fetchAssociations("meetings", "contacts", orphanIds),
      ]);

      const meetingToCompany = new Map<string, string>();
      for (const a of meetingCompanyAssocs) {
        if (a.toIds[0]) meetingToCompany.set(a.fromId, a.toIds[0]);
      }

      // Contact → company fallback for meetings still missing a company link.
      const meetingToContacts = new Map<string, string[]>();
      const allContactIds = new Set<string>();
      for (const a of meetingContactAssocs) {
        if (meetingToCompany.has(a.fromId)) continue; // already covered
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

      // Email-body fallback — last-ditch attempt for meetings that still
      // have no company link. HubSpot doesn't expose meeting attendee
      // emails as a property; the meeting↔contact association is the only
      // direct link, and it can be missing for Gong-imported meetings or
      // calendar-only one-offs. We scrape emails out of `hs_meeting_body`
      // / `hs_internal_meeting_notes`, search HubSpot contacts by email,
      // then walk to the associated company. Heuristic but bounded —
      // adds at most one search + one assoc call per request when needed.
      const stillUnresolved = orphans.filter((m) => !meetingToCompany.has(m.id));
      if (stillUnresolved.length > 0) {
        const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
        const SKIP_DOMAINS = ["understory.io"];
        const SKIP_LOCAL = /^(noreply|no-reply|notifications|calendar|mailer-daemon)@/i;
        const meetingToCandidateEmails = new Map<string, string[]>();
        const allEmails = new Set<string>();
        for (const m of stillUnresolved) {
          const bodySources = [
            m.properties.hs_meeting_body,
            m.properties.hs_internal_meeting_notes,
          ].filter((s): s is string => typeof s === "string" && s.length > 0);
          const matches = new Set<string>();
          for (const src of bodySources) {
            const found = src.match(EMAIL_RE) || [];
            for (const raw of found) {
              const lc = raw.toLowerCase();
              if (SKIP_DOMAINS.some((d) => lc.endsWith("@" + d))) continue;
              if (SKIP_LOCAL.test(lc)) continue;
              matches.add(lc);
            }
          }
          if (matches.size > 0) {
            meetingToCandidateEmails.set(m.id, Array.from(matches));
            for (const e of matches) allEmails.add(e);
          }
        }

        if (allEmails.size > 0) {
          const emails = Array.from(allEmails);
          const emailToContact = new Map<string, string>();
          for (let i = 0; i < emails.length; i += 100) {
            const batch = emails.slice(i, i + 100);
            try {
              const res = await fetch(
                `${HUBSPOT_API}/crm/v3/objects/contacts/search`,
                {
                  method: "POST",
                  headers: hubspotHeaders(),
                  body: JSON.stringify({
                    filterGroups: [
                      { filters: [{ propertyName: "email", operator: "IN", values: batch }] },
                    ],
                    properties: ["email"],
                    limit: 100,
                    // sorts is mandatory for stable pagination — see
                    // searchDealsPage in pay-migration.ts for the why.
                    sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
                  }),
                }
              );
              if (!res.ok) continue;
              const data = await res.json();
              for (const c of data.results || []) {
                const email = (c.properties?.email || "").toLowerCase();
                if (email) emailToContact.set(email, String(c.id));
              }
            } catch {
              // Ignore — orphan path is best-effort.
            }
          }

          const newContactIds = Array.from(new Set(emailToContact.values()));
          if (newContactIds.length > 0) {
            const newAssocs = await fetchAssociations(
              "contacts",
              "companies",
              newContactIds
            );
            const newContactToCompany = new Map<string, string>();
            for (const a of newAssocs) {
              if (a.toIds[0]) newContactToCompany.set(a.fromId, a.toIds[0]);
            }
            for (const [meetingId, candidateEmails] of meetingToCandidateEmails) {
              for (const email of candidateEmails) {
                const contactId = emailToContact.get(email);
                if (!contactId) continue;
                const companyId = newContactToCompany.get(contactId);
                if (companyId) {
                  meetingToCompany.set(meetingId, companyId);
                  break;
                }
              }
            }
          }
        }
      }

      const orphanCompanyIds = Array.from(new Set(meetingToCompany.values()));

      // Company props and companies→deals are independent (both keyed on the
      // same id list). Run them concurrently — saves ~150ms.
      const [orphanCompanyProps, companyDealAssocs] = await Promise.all([
        fetchObjectsBatch("companies", orphanCompanyIds, [
          "name",
          "understory_company_country",
          "domain",
        ]),
        orphanCompanyIds.length > 0
          ? fetchAssociations("companies", "deals", orphanCompanyIds)
          : Promise.resolve([]),
      ]);
      const companyToDealIds = new Map<string, string[]>();
      const allOrphanDealIds = new Set<string>();
      for (const a of companyDealAssocs) {
        companyToDealIds.set(a.fromId, a.toIds);
        for (const id of a.toIds) allOrphanDealIds.add(id);
      }
      const orphanDealProps = allOrphanDealIds.size > 0
        ? await fetchObjectsBatch("deals", Array.from(allOrphanDealIds), LIFECYCLE_DEAL_PROPS)
        : new Map<string, Record<string, string>>();
      // Pick the company's lifecycle deal across both the onboarding pipeline
      // and customer retention pipeline. Onboarding wins when both exist — the
      // CS team's brief should reflect onboarding context first, retention
      // second. Tie-break by most-recently created.
      const briefDealByCompany = new Map<string, { dealId: string; props: Record<string, string> }>();
      for (const [companyId, dealIds] of companyToDealIds) {
        const candidates = dealIds
          .map((id) => ({ id, props: orphanDealProps.get(id) }))
          .filter((c): c is { id: string; props: Record<string, string> } =>
            c.props != null && BRIEF_PIPELINES.includes(c.props.pipeline)
          );
        if (candidates.length === 0) continue;
        const pipelineRank = (p: string) => (p === LIFECYCLE_PIPELINE ? 0 : 1);
        candidates.sort((a, b) => {
          const r = pipelineRank(a.props.pipeline) - pipelineRank(b.props.pipeline);
          if (r !== 0) return r;
          return (b.props.createdate || "").localeCompare(a.props.createdate || "");
        });
        briefDealByCompany.set(companyId, { dealId: candidates[0].id, props: candidates[0].props });
      }
      // Owner names for any sales/CS owners on the picked deals.
      const orphanOwnerIds = new Set<string>();
      for (const { props } of briefDealByCompany.values()) {
        if (props.hubspot_owner_id) orphanOwnerIds.add(props.hubspot_owner_id);
      }
      if (orphanOwnerIds.size > 0) {
        const more = await fetchOwnerNames(Array.from(orphanOwnerIds));
        Object.assign(ownerNames, more);
      }

      const orphanMeetings = dedupMeetings(
        orphans
          .map((m) => {
            const startsAt = nullable(m.properties.hs_meeting_start_time);
            if (!startsAt) return null;
            const ownerId = m.properties.hubspot_owner_id || "";
            const meeting: OnboardingMeeting = {
              id: m.id,
              title: nullable(m.properties.hs_meeting_title) ?? "(Untitled meeting)",
              startsAt,
              endsAt: nullable(m.properties.hs_meeting_end_time),
              body: nullable(m.properties.hs_meeting_body),
              internalNotes: nullable(m.properties.hs_internal_meeting_notes),
              outcome: nullable(m.properties.hs_meeting_outcome),
              activityType: nullable(m.properties.hs_activity_type),
              ownerId,
              ownerName: ownerId ? (ownerNames[ownerId] ?? null) : null,
            };
            return meeting;
          })
          .filter((x): x is OnboardingMeeting => x != null)
      );

      for (const meeting of orphanMeetings) {
        if (isNoisySubject(meeting.title)) continue;
        const companyId = meetingToCompany.get(meeting.id);
        const cprops = companyId ? orphanCompanyProps.get(companyId) : null;
        // Drop meetings with no company link AND no client-shape title — likely internal.
        const fallbackName = inferCompanyFromTitle(meeting.title);
        if (!cprops && !fallbackName) continue;
        const companyName = cprops?.name?.trim() || fallbackName || "External meeting";
        const country = cprops ? nullable(cprops.understory_company_country) : null;

        const enriched = companyId ? briefDealByCompany.get(companyId) : null;
        const dp = enriched?.props ?? null;
        const salesOwnerId = dp?.hubspot_owner_id || null;

        const stubDeal: OnboardingDeal = {
          // Use the real deal ID when we found one — this makes "Open in HubSpot"
          // resolve to the actual deal record instead of a synthetic external- ID.
          dealId: enriched?.dealId ?? `external-${meeting.id}`,
          companyId: companyId ?? null,
          companyName,
          ownerId: meeting.ownerId,
          ownerName: meeting.ownerName ?? "Unassigned",
          country,
          plan: dp ? nullable(dp.subscription_plan) : null,
          acv: dp ? Math.round(parseFloat(dp.amount_in_home_currency || "0") || 0) : 0,
          signedAt: null,
          step: "Other",
          customerStage: dp?.customer_stage ?? "External",
          customerSubstage: dp ? nullable(dp.customer_substage) : null,
          daysInStep: 0,
          expectedDaysInStep: 30,
          riskLevel: "low",
          blockers: [],
          hibernationNote: dp ? nullable(dp.hibernation_notes) : null,
          productHoldNote: dp ? nullable(dp.product_hold_note) : null,
          obNotes: {
            understoryPayEnabled: dp ? parseEnableUnderstoryPay(dp.enable_understory_pay) : null,
            customerNeeds: dp ? nullable(dp["ob_note___customer_needs_"]) : null,
            promisesMade: dp ? nullable(dp["ob_note___promises_made"]) : null,
            experiencesLink: dp ? nullable(dp["ob_note___link_to_experience_s__that_need_to_be_created_"]) : null,
            growNotes: dp ? nullable(dp["ob_note___grow_notes__if_booked_"]) : null,
            contactName: null,
            contactEmail: null,
            contactPhone: null,
            companyDomain: cprops ? nullable(cprops.domain) : null,
            storefrontLink: dp ? nullable(dp.storefront) : null,
            payStatus: dp ? nullable(dp.understory_pay_status__customer) : null,
          },
          commercial: {
            monthlyFee: dp ? formatMonthlyFee(dp.core_net_price__local_currency, dp.deal_currency_code) : null,
            acv: dp ? formatAcv(dp.amount_in_home_currency) : null,
            bookingFee: dp ? formatBookingFee(dp.booking_fee, dp.confirmed_booking_fee) : null,
            firstBilling: dp ? formatFirstBilling(dp.test_billing_start_date) : null,
            salesOwner: salesOwnerId ? (ownerNames[salesOwnerId] ?? "missing") : "missing",
          },
          selfOnboarding: dp?.self_onboarding === "true",
          lastTouch: dp ? nullable(dp.notes_last_contacted) : null,
          history: [],
          // Backports populated in Tasks 13-14; empty defaults keep the type valid.
          invoices: { open: 0, overdue: 0, overdueDays: null, outstandingEur: null },
          futureEvents: null,
          watchOuts: [],
        };

        meetings.push({ meeting, deal: stubDeal });
      }
      if (spans) spans.push({ label: "hubspot.orphanEnrich", ms: performance.now() - orphanT0 });
    }
  }

  meetings.sort((a, b) => a.meeting.startsAt.localeCompare(b.meeting.startsAt));

  // Sort deals: high-risk first, then by ACV.
  const riskRank: Record<OnboardingRisk, number> = { high: 0, medium: 1, low: 2 };
  deals.sort((a, b) => riskRank[a.riskLevel] - riskRank[b.riskLevel] || b.acv - a.acv);

  return { deals, meetings };
}

/**
 * Lazy history fetch — calls + threaded emails for the given deal IDs.
 * The list payload (buildOnboardingPayload) ships meeting-derived history only;
 * this fills in the rest on demand from the meeting brief.
 *
 * Returns a map keyed by dealId. Entries are filtered to the past and sorted
 * descending by occurredAt.
 */
export async function fetchHistoryForDeals(
  dealIds: string[]
): Promise<Map<string, OnboardingHistoryEntry[]>> {
  const result = new Map<string, OnboardingHistoryEntry[]>();
  if (dealIds.length === 0) return result;

  const [callsByDeal, emailsByDeal] = await Promise.all([
    fetchCallsForDeals(dealIds),
    fetchEmailsForDeals(dealIds),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const dealId of dealIds) {
    const callHistory: OnboardingHistoryEntry[] = [];
    for (const c of callsByDeal.get(dealId) ?? []) {
      const t = new Date(c.occurredAt).getTime();
      if (isNaN(t) || t >= today.getTime()) continue;
      callHistory.push(c);
    }

    const pastEmails: OnboardingHistoryEntry[] = [];
    for (const e of emailsByDeal.get(dealId) ?? []) {
      const t = new Date(e.occurredAt).getTime();
      if (isNaN(t) || t >= today.getTime()) continue;
      pastEmails.push(e);
    }
    const threadedEmails = groupEmailsByThread(pastEmails);

    const merged = [...callHistory, ...threadedEmails].sort(
      (a, b) => b.occurredAt.localeCompare(a.occurredAt)
    );
    if (merged.length > 0) result.set(dealId, merged);
  }
  return result;
}

/**
 * Best-effort customer name extraction from a meeting title — for orphan meetings
 * that aren't linked to a HubSpot company. Handles the common Understory patterns
 * "Customer x Understory", "Customer & Understory", "Onboarding - Customer & Understory".
 */
function inferCompanyFromTitle(title: string): string | null {
  if (!title) return null;
  let s = title.trim();
  // Strip common prefixes like "Onboarding -", "Uppstartsmöte -", "Komma igång -".
  s = s.replace(/^\s*(onboarding|uppstartsm[öo]te|komma ig[åa]ng|implementation|f[öo]rsta m[öo]te|kickoff)\s*[-–]\s*/i, "");
  // Cut at the "x Understory" / "& Understory" boundary.
  const cut = s.split(/\s*[x×&]\s*(?:understory)\b/i)[0];
  const cleaned = cut.trim();
  if (!cleaned || /^understory$/i.test(cleaned)) return null;
  return cleaned;
}
