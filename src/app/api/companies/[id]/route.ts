import { NextRequest, NextResponse } from "next/server";
import { getCompanyDetail, getOwners, getDealStages } from "@/lib/hubspot";
import { summarizeEngagements, generateRecap } from "@/lib/summarize";
import { Cache } from "@/lib/cache";
import { CompanyDetail, OwnerMap, StageMap } from "@/lib/types";

const companyCache = new Cache<CompanyDetail>(5 * 60 * 1000);
const ownerCache = new Cache<OwnerMap>(60 * 60 * 1000);
const stageCache = new Cache<StageMap>(60 * 60 * 1000);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const cached = companyCache.get(id);
  if (cached) {
    const [owners, stages] = await Promise.all([
      getCachedOwners(),
      getCachedStages(),
    ]);
    return NextResponse.json({ ...cached, owners, stages });
  }

  try {
    const detail = await getCompanyDetail(id);

    const [owners, stages] = await Promise.all([
      getCachedOwners(),
      getCachedStages(),
    ]);

    // Skip individual engagement summaries to save tokens (1 API call instead of 11)
    // The recap gets all the context it needs from raw engagement content
    detail.recap = await generateRecap(
      detail.engagements,
      detail.company,
      detail.deal,
      owners,
      stages
    );

    companyCache.set(id, detail);

    return NextResponse.json({ ...detail, owners, stages });
  } catch {
    return NextResponse.json(
      { error: "Could not load company data" },
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
