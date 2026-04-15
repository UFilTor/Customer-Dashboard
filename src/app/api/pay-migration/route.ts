import { NextRequest, NextResponse } from "next/server";
import { fetchPayMigrationData } from "@/lib/pay-migration";
import { Cache } from "@/lib/cache";
import type { PayMigrationData } from "@/lib/types";

const payCache = new Cache<PayMigrationData>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  if (!refresh) {
    const cached = payCache.get("pay-migration");
    if (cached) return NextResponse.json(cached);
  }

  try {
    const data = await fetchPayMigrationData();
    payCache.set("pay-migration", data);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Could not load Pay Migration data" },
      { status: 500 }
    );
  }
}
