import { NextRequest, NextResponse } from "next/server";
import { getCompanyDetail, getOwners, getDealStages } from "@/lib/hubspot";
import { generateRecap } from "@/lib/summarize";
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

  // Validate ID shape — HubSpot company IDs are positive integers. Reject
  // anything else with 404 instead of returning a stub payload + owner directory.
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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
    // 404 when HubSpot has no record for this ID — `fetchCompany` returns an
    // empty object on a 404 from HubSpot. Don't expose stub data.
    if (!detail.company || Object.keys(detail.company).length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

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
