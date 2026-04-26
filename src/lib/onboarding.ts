import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
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
} from "./types";

// Pipelines (from the verified mapping spec).
const LIFECYCLE_PIPELINE = "166333631";
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
  const ccy = (currency || "EUR").toUpperCase();
  return `${Math.round(n).toLocaleString("en-US")} ${ccy}/mo`;
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

const MEETING_PROPS = [
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

interface RawObject {
  id: string;
  properties: Record<string, string>;
}

async function fetchOwnerNames(ownerIds: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ownerIds.filter(Boolean)));
  if (unique.length === 0) return {};
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
    return map;
  } catch {
    return {};
  }
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

interface BatchAssoc {
  fromId: string;
  toIds: string[];
}

async function fetchAssociations(
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

async function fetchObjectsBatch(
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

async function fetchSalesDealsForCompanies(companyIds: string[]): Promise<Map<string, RawObject[]>> {
  // Map companyId → sorted list of sales pipeline deals (most recent first).
  const dealsByCompany = new Map<string, RawObject[]>();
  if (companyIds.length === 0) return dealsByCompany;

  // Search sales-pipeline deals associated with any of the onboarding companies.
  // HubSpot caps filterGroups at 5 with up to 6 filters each, but `associatedWith`
  // sits inside a filterGroup with IN operator, so we batch the IDs.
  for (let i = 0; i < companyIds.length; i += 80) {
    const batch = companyIds.slice(i, i + 80);
    let after: string | undefined;
    do {
      const body: Record<string, unknown> = {
        filterGroups: [
          {
            filters: [
              { propertyName: "pipeline", operator: "EQ", value: SALES_PIPELINE },
            ],
            associatedWith: [
              {
                objectType: "companies",
                operator: "IN",
                objectIdValues: batch.map((id) => parseInt(id, 10)).filter((n) => !isNaN(n)),
              },
            ],
          },
        ],
        properties: SALES_DEAL_PROPS,
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
        limit: 200,
      };
      if (after) body.after = after;

      try {
        const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
          method: "POST",
          headers: hubspotHeaders(),
          body: JSON.stringify(body),
        });
        if (!res.ok) break;
        const data = await res.json();
        const dealIds = (data.results || []).map((d: RawObject) => d.id);
        if (dealIds.length === 0) break;

        // Fetch associations to figure out which company each deal belongs to.
        const assocs = await fetchAssociations("deals", "companies", dealIds);
        const dealToCompany = new Map<string, string>();
        for (const a of assocs) if (a.toIds[0]) dealToCompany.set(a.fromId, a.toIds[0]);

        for (const d of data.results || []) {
          const companyId = dealToCompany.get(d.id);
          if (!companyId) continue;
          const arr = dealsByCompany.get(companyId) || [];
          arr.push(d);
          dealsByCompany.set(companyId, arr);
        }
        after = data.paging?.next?.after;
      } catch {
        break;
      }
    } while (after);
  }

  // Sort each company's deal list by createdate DESC.
  for (const [, list] of dealsByCompany) {
    list.sort((a, b) =>
      (b.properties.createdate || "").localeCompare(a.properties.createdate || "")
    );
  }
  return dealsByCompany;
}

function pickSalesFallback(
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
async function fetchUpcomingMeetingsByOwners(
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
  ]);

  const out = new Map<string, CompanyInfo>();
  for (const [dealId, companyId] of dealToCompany) {
    const props = companyProps.get(companyId);
    if (!props) continue;
    out.set(dealId, {
      companyId,
      name: props.name || "Unknown",
      country: nullable(props.understory_company_country),
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
 */
export async function buildOnboardingPayload(
  opts: { ownerIds?: string[] } = {}
): Promise<OnboardingPayload> {
  const lifecycleDeals = await fetchLifecycleDeals(opts.ownerIds);
  if (lifecycleDeals.length === 0) {
    return { deals: [], meetings: [] };
  }

  const dealIds = lifecycleDeals.map((d) => d.id);

  // List payload only fetches what the list view shows: company info + meetings
  // (used for upcoming bucket AND meeting-history). Calls and emails come from
  // /api/onboarding/history on demand — they're the expensive per-deal fetches
  // and the list never renders them.
  const [companyMap, meetingsByDeal] = await Promise.all([
    fetchCompaniesForDeals(dealIds),
    fetchMeetingsForDeals(dealIds),
  ]);

  const companyIds = Array.from(
    new Set(Array.from(companyMap.values()).map((c) => c.companyId))
  );
  const salesDealsByCompany = await fetchSalesDealsForCompanies(companyIds);

  // Resolve owner names for both lifecycle CS owners and sales owners we'll attribute.
  const lifecycleOwnerIds = lifecycleDeals.map((d) => d.properties.hubspot_owner_id).filter(Boolean);
  const salesOwnerIds: string[] = [];
  for (const list of salesDealsByCompany.values()) {
    for (const d of list) if (d.properties.hubspot_owner_id) salesOwnerIds.push(d.properties.hubspot_owner_id);
  }
  const ownerNames = await fetchOwnerNames([...lifecycleOwnerIds, ...salesOwnerIds]);

  // Build deals with full brief.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Meetings window: 3 days ahead. Trimmed from 7 to keep the payload small
  // and avoid pulling a week of unrelated meetings the user won't act on.
  const meetingHorizon = new Date(today);
  meetingHorizon.setDate(meetingHorizon.getDate() + 3);

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

    const obNotes: OnboardingObNotesExtended = {
      understoryPayEnabled: parseEnableUnderstoryPay(p.enable_understory_pay),
      customerNeeds: nullable(p["ob_note___customer_needs_"]),
      promisesMade: nullable(p["ob_note___promises_made"]),
      experiencesLink: nullable(p["ob_note___link_to_experience_s__that_need_to_be_created_"]),
      growNotes: nullable(p["ob_note___grow_notes__if_booked_"]),
    };

    const company = companyMap.get(d.id);

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

    const commercial: OnboardingCommercial = {
      monthlyFee: formatMonthlyFee(p.core_net_price__local_currency, p.deal_currency_code),
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
      expectedDaysInStep: EXPECTED_DAYS[step] ?? 30,
      riskLevel: computeRisk(step, daysInStep, blockers),
      blockers,
      hibernationNote,
      productHoldNote,
      obNotes,
      commercial,
      selfOnboarding: p.self_onboarding === "true",
      lastTouch: nullable(p.notes_last_contacted),
      history,
    };

    // Slot meetings inside the 7-day window into the flat list.
    for (const m of allMeetings) {
      const t = new Date(m.startsAt).getTime();
      if (!isNaN(t) && t >= today.getTime() && t < meetingHorizon.getTime()) {
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
  // every CS owner's calendar.
  const csOwnerIds = opts.ownerIds && opts.ownerIds.length > 0
    ? opts.ownerIds
    : Array.from(new Set(lifecycleOwnerIds));
  if (csOwnerIds.length > 0) {
    const ownerDirect = await fetchUpcomingMeetingsByOwners(
      csOwnerIds,
      today.toISOString(),
      meetingHorizon.toISOString()
    );

    const knownMeetingIds = new Set<string>();
    for (const list of meetingsByDeal.values()) {
      for (const m of list) knownMeetingIds.add(m.id);
    }

    const orphans = ownerDirect.filter((m) => !knownMeetingIds.has(m.id));
    if (orphans.length > 0) {
      const orphanIds = orphans.map((m) => m.id);
      const meetingCompanyAssocs = await fetchAssociations("meetings", "companies", orphanIds);
      const meetingToCompany = new Map<string, string>();
      for (const a of meetingCompanyAssocs) {
        if (a.toIds[0]) meetingToCompany.set(a.fromId, a.toIds[0]);
      }
      const orphanCompanyIds = Array.from(new Set(meetingToCompany.values()));
      const orphanCompanyProps = await fetchObjectsBatch("companies", orphanCompanyIds, [
        "name",
        "understory_company_country",
      ]);

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

        const stubDeal: OnboardingDeal = {
          dealId: `external-${meeting.id}`,
          companyId: companyId ?? null,
          companyName,
          ownerId: meeting.ownerId,
          ownerName: meeting.ownerName ?? "Unassigned",
          country,
          plan: null,
          acv: 0,
          signedAt: null,
          step: "Other",
          customerStage: "External",
          customerSubstage: null,
          daysInStep: 0,
          expectedDaysInStep: 30,
          riskLevel: "low",
          blockers: [],
          hibernationNote: null,
          productHoldNote: null,
          obNotes: {
            understoryPayEnabled: null,
            customerNeeds: null,
            promisesMade: null,
            experiencesLink: null,
            growNotes: null,
          },
          commercial: {
            monthlyFee: null,
            acv: null,
            bookingFee: null,
            firstBilling: null,
            salesOwner: "missing",
          },
          selfOnboarding: false,
          lastTouch: null,
          history: [],
        };

        meetings.push({ meeting, deal: stubDeal });
      }
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
