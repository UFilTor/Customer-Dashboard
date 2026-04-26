import { NextRequest, NextResponse } from "next/server";
import { fetchInvoices, fetchHealthScoreIssues, fetchNoFutureEvents } from "@/lib/attention";
import { Cache } from "@/lib/cache";
import { AttentionCompany, AttentionResponse } from "@/lib/types";

function computeEnteredGroupAt(company: AttentionCompany, signal: string): string | undefined {
  const now = Date.now();
  if ((signal === "overdue_invoices" || signal === "open_invoices") && company.daysOverdue !== undefined) {
    return new Date(now - company.daysOverdue * 86400000).toISOString();
  }
  if (signal === "health_score" && company.categoryChangedAt) {
    return company.categoryChangedAt;
  }
  return undefined;
}

const attentionCache = new Cache<AttentionResponse>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  if (!refresh) {
    const cached = attentionCache.get("attention");
    if (cached) return NextResponse.json(cached);
  }

  try {
    // Fetch sequentially to avoid HubSpot rate limits
    const invoices = await fetchInvoices();
    const healthScore = await fetchHealthScoreIssues();
    const noFutureEvents = await fetchNoFutureEvents();

    const groups = [
      { signal: "overdue_invoices" as const, label: "Overdue Invoices", companies: invoices.overdue },
      { signal: "open_invoices" as const, label: "Open Invoices", companies: invoices.open },
      { signal: "health_score" as const, label: "Health Score Issues", companies: healthScore },
      { signal: "no_future_events" as const, label: "No Future Events", companies: noFutureEvents },
    ].filter((g) => g.companies.length > 0);

    const enrichedGroups = groups.map((group) => ({
      ...group,
      companies: group.companies.map((company) => ({
        ...company,
        enteredGroupAt: computeEnteredGroupAt(company, group.signal),
      })),
    }));

    const response: AttentionResponse = {
      groups: enrichedGroups,
      updatedAt: new Date().toISOString(),
    };

    attentionCache.set("attention", response);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Could not load attention data" },
      { status: 500 }
    );
  }
}
