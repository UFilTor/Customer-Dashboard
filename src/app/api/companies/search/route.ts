import { NextRequest, NextResponse } from "next/server";
import { searchCompanies } from "@/lib/hubspot";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const results = await searchCompanies(query);
  return NextResponse.json(results);
}
