import { NextRequest, NextResponse } from "next/server";
import { getCompanyDetail, getOwners, getDealStages } from "@/lib/hubspot";
import { generateRecap } from "@/lib/summarize";
import { Cache } from "@/lib/cache";
import type { OwnerMap, Recap, StageMap } from "@/lib/types";

// Edge runtime — same reasoning as the parent /api/companies/[id] route.
export const runtime = "edge";

// The Cache helper returns `null` on miss AND when a stored value is null.
// Wrap the cached recap in an object so we can tell the two cases apart;
// otherwise every uncached company id looks like "we have a cached null
// result" and the route returns {recap: null} without ever calling Anthropic.
type CachedRecap = { value: Recap | null };
const recapCache = new Cache<CachedRecap>(5 * 60 * 1000);
const ownerCache = new Cache<OwnerMap>(60 * 60 * 1000);
const stageCache = new Cache<StageMap>(60 * 60 * 1000);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cached = recapCache.get(id);
  if (cached) {
    return NextResponse.json({ recap: cached.value });
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
      stages
    );

    // Only cache successful recaps. An Anthropic outage or parse error
    // (recap?.error === true) should be retried on the next click rather
    // than poisoning the cache for 5 minutes.
    if (!recap || !recap.error) {
      recapCache.set(id, { value: recap });
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
