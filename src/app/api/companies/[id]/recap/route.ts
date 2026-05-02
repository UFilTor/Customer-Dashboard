import { NextRequest, NextResponse } from "next/server";
import { getCompanyDetail, getOwners, getDealStages } from "@/lib/hubspot";
import { generateRecap } from "@/lib/summarize";
import { Cache } from "@/lib/cache";
import type { OwnerMap, Recap, StageMap } from "@/lib/types";

// Edge runtime — same reasoning as the parent /api/companies/[id] route.
export const runtime = "edge";

// Recap cache is decoupled from the company-detail cache so a recap miss
// (Anthropic outage, bad parse) doesn't poison the panel. 5-minute TTL
// matches the parent so they expire roughly together.
const recapCache = new Cache<Recap | null>(5 * 60 * 1000);
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
  if (cached !== undefined) {
    return NextResponse.json({ recap: cached });
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

    recapCache.set(id, recap);
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
