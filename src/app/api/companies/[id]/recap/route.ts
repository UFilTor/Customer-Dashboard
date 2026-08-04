import { NextRequest, NextResponse } from "next/server";
import { getCompanyDetail, getOwners, getDealStages } from "@/lib/hubspot";
import { generateRecap, type RecapAccountState } from "@/lib/summarize";
import { computeWatchOutSignals } from "@/lib/signals";
import { classifyPortfolioStage } from "@/lib/portfolio";
import { hasUnpaidInvoice, unpaidAmountLocal, dealCurrency } from "@/lib/invoice-fields";
import { toEur } from "@/lib/fx";
import { Cache } from "@/lib/cache";
import type { CompanyDetail, OwnerMap, Recap, StageMap } from "@/lib/types";

// Node runtime (was edge): the in-memory cache must live in the same shared
// lambda the cron warm hits, otherwise warming lands in a different isolate
// and users still see cold recaps.

// The Cache helper returns `null` on miss AND when a stored value is null.
// Wrap the cached recap in an object so we can tell the two cases apart;
// otherwise every uncached company id looks like "we have a cached null
// result" and the route returns {recap: null} without ever calling Anthropic.
type CachedRecap = { value: Recap | null };
// 60 min: recaps only change when engagements change, and the cron warm
// refreshes them for upcoming-meeting companies anyway.
const recapCache = new Cache<CachedRecap>(60 * 60 * 1000);
const ownerCache = new Cache<OwnerMap>(60 * 60 * 1000);
const stageCache = new Cache<StageMap>(60 * 60 * 1000);

// Mirror of the state Meeting Prep feeds computeWatchOutSignals, built from
// the detail payload's raw company/deal props. daysInStep is intentionally
// omitted (stuck_in_step won't fire here — it's covered by the dashboards).
function buildAccountState(detail: CompanyDetail): RecapAccountState {
  const cp = detail.company || {};
  const dp = detail.deal || {};
  const nowIso = new Date().toISOString();

  const outstandingRaw = unpaidAmountLocal(dp);
  const outstandingEur =
    outstandingRaw > 0 ? Math.round(toEur(outstandingRaw, dealCurrency(dp))) : null;
  const dueIso = dp.understory_earliest_unpaid_invoice_due_date || null;
  let overdueDays: number | null = null;
  if (dueIso) {
    const due = new Date(dueIso).getTime();
    if (!isNaN(due) && due < Date.now()) {
      overdueDays = Math.floor((Date.now() - due) / (24 * 60 * 60 * 1000));
    }
  }
  const upcomingRaw = cp.understory_health_score_upcoming_events;
  const upcoming = upcomingRaw != null && upcomingRaw !== "" ? parseFloat(upcomingRaw) : NaN;

  const signals = computeWatchOutSignals({
    nowIso,
    unpaidInvoice: hasUnpaidInvoice(dp),
    invoiceDueDate: dueIso,
    outstandingEur,
    overdueDays,
    wishToChurn: dp.wish_to_churn === "true",
    churnReason: dp.churn_reason || null,
    volume3m: parseFloat(cp.understory_booking_volume_3m || "0") || 0,
    volume6m: parseFloat(cp.understory_booking_volume_6m || "0") || 0,
    healthScore: parseFloat(cp.health_score || "") || null,
    upcomingEvents: isNaN(upcoming) ? null : upcoming,
    notesLastContacted: cp.notes_last_contacted || dp.notes_last_contacted || null,
    daysInStep: null,
    expectedDaysInStep: null,
    stage: classifyPortfolioStage(
      dp.customer_stage || "",
      dp.pipeline || "",
      dp.customer_substage || null
    ),
  });

  return { signals, sinceLastTouch: detail.sinceLastTouch };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Let Vercel's edge CDN carry warmed recaps across lambdas.
  const cacheHeaders = {
    "Cache-Control": "s-maxage=3300, stale-while-revalidate=300",
  };

  const cached = recapCache.get(id);
  if (cached) {
    return NextResponse.json({ recap: cached.value }, { headers: cacheHeaders });
  }

  try {
    const detail = await getCompanyDetail(id);
    if (!detail.company || Object.keys(detail.company).length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [owners, stages] = await Promise.all([
      getCachedOwners(),
      getCachedStages(),
    ]);

    const recap = await generateRecap(
      detail.engagements,
      detail.company,
      detail.deal,
      owners,
      stages,
      buildAccountState(detail)
    );

    // Only cache successful recaps. An Anthropic outage or parse error
    // (recap?.error === true) should be retried on the next click rather
    // than poisoning the cache.
    if (!recap || !recap.error) {
      recapCache.set(id, { value: recap });
      return NextResponse.json({ recap }, { headers: cacheHeaders });
    }
    return NextResponse.json({ recap });
  } catch {
    return NextResponse.json(
      { error: "Could not load recap" },
      { status: 500 }
    );
  }
}

async function getCachedOwners(): Promise<OwnerMap> {
  const cached = ownerCache.get("owners");
  if (cached) return cached;
  const owners = await getOwners();
  ownerCache.set("owners", owners);
  return owners;
}

async function getCachedStages(): Promise<StageMap> {
  const cached = stageCache.get("stages");
  if (cached) return cached;
  const stages = await getDealStages();
  stageCache.set("stages", stages);
  return stages;
}
