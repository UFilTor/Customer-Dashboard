import { NextRequest, NextResponse } from "next/server";
import { getCompanyDetail, getOwners, getDealStages } from "@/lib/hubspot";
import { Cache } from "@/lib/cache";
import { CompanyDetail, OwnerMap, StageMap } from "@/lib/types";

// Node runtime (was edge): the recap and note-signals routes reuse the
// company detail via the lib-level cache in getCompanyDetail, and edge
// isolates don't share memory with node lambdas. One shared process means
// clicking a company fetches HubSpot once and the two LLM routes ride it.

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

    // Recap (Anthropic Haiku) is fetched lazily by /api/companies/[id]/recap
    // so the detail panel can paint as soon as HubSpot data is ready. The
    // 2-4s LLM round-trip used to block this response.
    detail.recap = null;

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
