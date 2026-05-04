import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { searchObjectsPage } from "./hubspot-search";
import { getOwners } from "./hubspot";
import { OWNERS } from "./owners";
import type { PayDeal, PayStage, PayOwnerSummary, PayMigrationData } from "./types";
import { classifyUnwillingForQ2 } from "./pay-q2-classifier";

const PAY_PIPELINE = "1072518362";
// Excluded customer_stage values from the Pay Migration scope. Paused
// customers stay in the calculation (per Filip 2026-04-30) — they're still
// active relationships even if temporarily on hold, and we want their pay
// status reflected in the migration progress numbers.
const RETENTION_EXCLUDED_STAGES = ["Churned"];

const DEAL_PROPERTIES = [
  "dealname",
  "dealstage",
  "pipeline",
  "customer_stage",
  "understory_pay_status__customer",
  "realized_business_volume_annual",
  "amount_in_home_currency",
  "subscription_plan",
  "hubspot_owner_id",
  "notes_last_updated",
  "notes_last_contacted",
  "hs_object_id",
  "understory_pay_unwilling_reason__deal",
  "unpaid_invoice",
  "number_of_open_invoices",
  "invoice_due_date",
];

const LIVE_STAGES: PayStage[] = ["Verified", "Live"];
const IN_PROGRESS_STAGES: PayStage[] = ["Verified", "Live", "Started Onboarding", "Signed - Not Started", "Pending Verification"];
const PUSH_STAGES: PayStage[] = ["Started Onboarding", "Signed - Not Started", "Pending Verification"];


// Fallback reasons for deals where HubSpot doesn't have the reason field
const UNWILLING_REASONS_FALLBACK: Record<string, string> = {
  "493822569712": "Obligated to use NETS due to contract",
  "493882195149": "Obligated to use NETS due to contract",
  "493820629235": "Obligated to use NETS due to contract",
  "493669442761": "Prefers Stripe for now; revisit when GYG is ready",
  "468481154243": "Familiar with Stripe, wants to wait. Revisit when GYG is available.",
  "371433817335": "Unwilling to set up until missing features are resolved.",
  "335924539590": "Is churning end of the month",
  "313146273010": "Only two weeks left of season; will switch in November",
  "239436905700": "Have a very good deal with NETS",
  "227447527639": "Waiting for Triple-Tex integration",
  "188180600036": "Doesn't want to change right before her big event",
  "161206686967": "Don't sell anything. Only free bookings.",
  "142145201390": "Mainly free bookings, don't want to switch",
  "114216725752": "Accountant reviewing; currently using Stripe on webshop",
  "78085849283": "Wants to see it working for others + E-conomic integration at 100%",
  "61178435801": "Wants to wait until Understory Pay is stable",
  "22230395627": "Too many Stripe integrations, needs feature parity first",
  "18472246726": "Needs one payment solution across multiple company accounts",
  "11643330020": "Savings not big enough to justify switching right now",
  "9692743631": "Not right before season; wants to see it working for others first",
  "9541350349": "Uses Stripe in their shop, doesn't want multiple payment solutions",
  "402942595314": "Testing the system; not computer-savvy, revisit after summer",
  "188022828242": "Only do free events, not relevant at the moment",
  "376895577279": "Only have free bookings, doesn't make sense to switch",
};

function cleanDealName(dealname: string): string {
  return dealname
    .replace(/\s*[-\u2013]?\s*(Customer\s+Lifecycle\s+deal|Product\s+Lifecycle\s+deal|Customer\s+Lifecycle|Lifecycle|New\s+Deal)\s*$/i, "")
    .trim();
}

function emptyStageRecord(): Record<PayStage, { count: number; bv: number }> {
  return {
    "Not yet enrolled": { count: 0, bv: 0 },
    "Signed - Not Started": { count: 0, bv: 0 },
    "Started Onboarding": { count: 0, bv: 0 },
    "Pending Verification": { count: 0, bv: 0 },
    "Verified": { count: 0, bv: 0 },
    "Live": { count: 0, bv: 0 },
    "Ineligible": { count: 0, bv: 0 },
    "Unwilling": { count: 0, bv: 0 },
  };
}

function mapStage(rawStatus: string | null | undefined): PayStage {
  if (!rawStatus || rawStatus.trim() === "") return "Not yet enrolled";
  const normalized = rawStatus.trim();
  if (normalized === "Connected") return "Verified";
  const valid: PayStage[] = [
    "Not yet enrolled",
    "Signed - Not Started",
    "Started Onboarding",
    "Pending Verification",
    "Verified",
    "Live",
    "Ineligible",
    "Unwilling",
  ];
  return valid.includes(normalized as PayStage) ? (normalized as PayStage) : "Not yet enrolled";
}

interface RawDeal {
  id: string;
  properties: Record<string, string>;
}

// Retry-aware paged search for deals. The shared helper in hubspot-search.ts
// handles the actual fetch + retry loop; this thin wrapper just keeps the
// type narrow to RawDeal so callers don't have to cast.
async function searchDealsPage(
  body: Record<string, unknown>
): Promise<{ results: RawDeal[]; nextAfter: string | undefined }> {
  return searchObjectsPage<RawDeal>("deals", body);
}

async function fetchAllPayDeals(): Promise<RawDeal[]> {
  const allDeals: RawDeal[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [
          { propertyName: "pipeline", operator: "EQ", value: PAY_PIPELINE },
          { propertyName: "customer_stage", operator: "NOT_IN", values: RETENTION_EXCLUDED_STAGES },
        ],
      }],
      properties: DEAL_PROPERTIES,
      // HubSpot search pagination is reliable only when a `sorts` clause is
      // present — without it the cursor can stop early. createdate desc gives
      // a stable order for the page-through to honor.
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
    };
    if (after) body.after = after;

    const { results, nextAfter } = await searchDealsPage(body);
    allDeals.push(...results);
    after = nextAfter;
  } while (after);

  return allDeals;
}

async function fetchUnwillingReasons(): Promise<Record<string, string>> {
  const reasons: Record<string, string> = {};
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [
          { propertyName: "pipeline", operator: "EQ", value: PAY_PIPELINE },
          { propertyName: "understory_pay_unwilling_reason__deal", operator: "HAS_PROPERTY" },
        ],
      }],
      properties: ["dealname", "understory_pay_unwilling_reason__deal", "hs_object_id"],
      limit: 200,
    };
    if (after) body.after = after;

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const d of data.results || []) {
      const reason = d.properties.understory_pay_unwilling_reason__deal;
      if (reason) reasons[d.id] = reason;
    }
    after = data.paging?.next?.after;
  } while (after);

  return reasons;
}

async function fetchZeroEventDealIds(): Promise<Set<string>> {
  const companyIds: string[] = [];
  let after: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filterGroups: [{
        filters: [{
          propertyName: "understory_health_score_upcoming_events",
          operator: "LTE",
          value: "0",
        }],
      }],
      properties: ["name"],
      limit: 200,
    };
    if (after) body.after = after;

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const c of data.results || []) {
      companyIds.push(c.id);
    }
    after = data.paging?.next?.after;
  } while (after);

  if (companyIds.length === 0) return new Set();

  // Use HubSpot's batch associations endpoint (up to 100 IDs per request,
  // running batches in parallel) instead of per-company GETs. This collapses
  // ~zeroEventCompanies/5 sequential calls into ~zeroEventCompanies/100
  // parallel calls — typically ~99% reduction in wall time.
  const dealIds = new Set<string>();
  const batches: string[][] = [];
  for (let i = 0; i < companyIds.length; i += 100) {
    batches.push(companyIds.slice(i, i + 100));
  }
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await fetch(
          `${HUBSPOT_API}/crm/v4/associations/companies/deals/batch/read`,
          {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const result of data.results || []) {
          for (const t of result.to || []) {
            dealIds.add(String(t.toObjectId));
          }
        }
      } catch {
        // Best-effort — partial result is better than total failure.
      }
    })
  );

  return dealIds;
}

function buildOwnerSummary(ownerId: string, ownerName: string, deals: PayDeal[]): PayOwnerSummary {
  const stageCounts = emptyStageRecord();
  let ownerTotalBv = 0;
  let ownerIneligibleBv = 0;
  let ownerLiveVerifiedBv = 0;
  let ownerInProgressBv = 0;
  let ownerTotalAcv = 0;
  let ownerLiveVerifiedAcv = 0;

  for (const deal of deals) {
    stageCounts[deal.stage].count++;
    stageCounts[deal.stage].bv += deal.bv;
    ownerTotalBv += deal.bv;
    ownerTotalAcv += deal.acv;
    if (deal.stage === "Ineligible") ownerIneligibleBv += deal.bv;
    if (LIVE_STAGES.includes(deal.stage)) {
      ownerLiveVerifiedBv += deal.bv;
      ownerLiveVerifiedAcv += deal.acv;
    }
    if (IN_PROGRESS_STAGES.includes(deal.stage)) ownerInProgressBv += deal.bv;
  }

  const ownerEligibleBv = ownerTotalBv - ownerIneligibleBv;

  return {
    ownerId,
    ownerName,
    lcPercent: ownerEligibleBv > 0 ? (ownerLiveVerifiedBv / ownerEligibleBv) * 100 : 0,
    inProgressPercent: ownerEligibleBv > 0 ? (ownerInProgressBv / ownerEligibleBv) * 100 : 0,
    arrPercent: ownerTotalAcv > 0 ? (ownerLiveVerifiedAcv / ownerTotalAcv) * 100 : 0,
    eligibleBv: ownerEligibleBv,
    totalBv: ownerTotalBv,
    stageCounts,
    deals: deals.sort((a, b) => b.bv - a.bv),
  };
}

export async function fetchPayMigrationData(
  spans?: import("./perf").Spans
): Promise<PayMigrationData> {
  const time = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    if (!spans) return fn();
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      spans.push({ label, ms: performance.now() - t0 });
    }
  };

  const [rawDeals, unwillingReasons, zeroEventDealIds, ownerMap] = await Promise.all([
    time("hubspot.payDeals", () => fetchAllPayDeals()),
    time("hubspot.unwillingReasons", () => fetchUnwillingReasons()),
    time("hubspot.zeroEventDeals", () => fetchZeroEventDealIds()),
    time("hubspot.owners", () => getOwners()),
  ]);

  // Deduplicate deals by ID
  const deduped = new Map<string, RawDeal>();
  for (const d of rawDeals) {
    deduped.set(d.id, d);
  }

  const now = Date.now();
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  const allDeals: PayDeal[] = [];
  for (const raw of deduped.values()) {
    const p = raw.properties;
    const rawPayStatus = (p.understory_pay_status__customer || "").trim();

    const stage = mapStage(rawPayStatus);

    // Merge unwilling reasons: HubSpot field > API fetch > fallback dict
    const unwillingReason =
      p.understory_pay_unwilling_reason__deal ||
      unwillingReasons[raw.id] ||
      UNWILLING_REASONS_FALLBACK[raw.id] ||
      null;

    // Last activity date
    const lastUpdated = p.notes_last_updated || null;
    const lastContacted = p.notes_last_contacted || null;
    let lastActivityDate: string | null = null;
    if (lastUpdated && lastContacted) {
      lastActivityDate = lastUpdated > lastContacted ? lastUpdated : lastContacted;
    } else {
      lastActivityDate = lastUpdated || lastContacted;
    }

    const daysSinceActivity = lastActivityDate
      ? Math.floor((now - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const ownerId = p.hubspot_owner_id || "";

    allDeals.push({
      dealId: raw.id,
      companyId: null,
      dealName: cleanDealName(p.dealname || "Unknown deal"),
      stage,
      rawPayStatus,
      bv: parseFloat(p.realized_business_volume_annual || "0") || 0,
      acv: parseFloat(p.amount_in_home_currency || "0") || 0,
      plan: p.subscription_plan || "",
      ownerId,
      ownerName: ownerMap[ownerId] || ownerId,
      lastActivityDate,
      daysSinceActivity,
      unwillingReason,
      hasOpenInvoice: (p.unpaid_invoice === "true") || (parseInt(p.number_of_open_invoices || "0") || 0) > 0,
      zeroEvents: zeroEventDealIds.has(raw.id),
    });
  }

  // Foundation override: Pay can't onboard foundations today, so any deal
  // whose unwilling reason mentions a foundation-style legal entity gets
  // its stage rewritten to "Unwilling" before partitioning. Without this
  // they'd linger in PathCard's pipeline section even after the CSM
  // captured the blocker in the reason field.
  const FOUNDATION_RX = /\b(foundation|stiftelse|stiftung|fond)\b/i;
  for (const deal of allDeals) {
    if (
      deal.stage !== "Unwilling" &&
      deal.unwillingReason &&
      FOUNDATION_RX.test(deal.unwillingReason)
    ) {
      deal.stage = "Unwilling";
    }
  }

  // Compute stage breakdown
  const stageBreakdown = emptyStageRecord();
  let totalBv = 0;
  let totalAcv = 0;
  let ineligibleBv = 0;
  let liveVerifiedBv = 0;
  let inProgressBv = 0;
  let liveVerifiedAcv = 0;

  for (const deal of allDeals) {
    stageBreakdown[deal.stage].count++;
    stageBreakdown[deal.stage].bv += deal.bv;
    totalBv += deal.bv;
    totalAcv += deal.acv;

    if (deal.stage === "Ineligible") {
      ineligibleBv += deal.bv;
    }
    if (LIVE_STAGES.includes(deal.stage)) {
      liveVerifiedBv += deal.bv;
      liveVerifiedAcv += deal.acv;
    }
    if (IN_PROGRESS_STAGES.includes(deal.stage)) {
      inProgressBv += deal.bv;
    }
  }

  const eligibleBv = totalBv - ineligibleBv;
  const bvLiveVerifiedPercent = eligibleBv > 0 ? (liveVerifiedBv / eligibleBv) * 100 : 0;
  const bvInProgressPercent = eligibleBv > 0 ? (inProgressBv / eligibleBv) * 100 : 0;
  const arrLiveVerifiedPercent = totalAcv > 0 ? (liveVerifiedAcv / totalAcv) * 100 : 0;

  // Build "All Owners" summary
  const allOwnersSummary = buildOwnerSummary("all", "All Owners", allDeals);

  // Group by owner. Seed with every CS owner so the dashboard always lists
  // each person — even at 0% or 100% — regardless of whether HubSpot has any
  // deals attributed to them today.
  const ownerGroups = new Map<string, PayDeal[]>();
  for (const o of OWNERS) ownerGroups.set(o.id, []);
  for (const deal of allDeals) {
    const key = deal.ownerId || "unassigned";
    if (!ownerGroups.has(key)) ownerGroups.set(key, []);
    ownerGroups.get(key)!.push(deal);
  }

  const owners: PayOwnerSummary[] = [];
  for (const [ownerId, deals] of ownerGroups) {
    owners.push(buildOwnerSummary(ownerId, ownerMap[ownerId] || ownerId, deals));
  }
  owners.sort((a, b) => b.eligibleBv - a.eligibleBv);

  // Needs a Push: Signed + Pending Verification deals with 3+ days since last activity
  const needsAPush = allDeals
    .filter((d) => {
      if (!PUSH_STAGES.includes(d.stage)) return false;
      if (!d.lastActivityDate) return true;
      return now - new Date(d.lastActivityDate).getTime() > threeDaysMs;
    })
    .sort((a, b) => b.bv - a.bv);

  // Unwilling deals (foundation-override applied above pre-partition).
  const unwillingRaw = allDeals
    .filter((d) => d.stage === "Unwilling")
    .sort((a, b) => b.bv - a.bv);
  const q2Map = await classifyUnwillingForQ2(unwillingRaw);
  const unwilling = unwillingRaw.map((d) => ({
    ...d,
    q2Likely: q2Map.get(d.dealId) ?? false,
  }));

  // Not yet enrolled: raw pay status is blank AND not overridden to another stage
  const notEnrolled = allDeals
    .filter((d) => d.rawPayStatus === "" && !["Unwilling", "Ineligible", "Live", "Verified"].includes(d.stage))
    .sort((a, b) => b.bv - a.bv);

  return {
    bvLiveVerifiedPercent,
    bvInProgressPercent,
    arrLiveVerifiedPercent,
    targetPct: 60,
    totalBv,
    totalAcv,
    eligibleBv,
    liveVerifiedBv,
    inProgressBv,
    ineligibleBv,
    liveVerifiedAcv,
    stageBreakdown,
    owners,
    allOwnersSummary,
    needsAPush,
    unwilling,
    notEnrolled,
    allDeals,
    updatedAt: new Date().toISOString(),
  };
}
