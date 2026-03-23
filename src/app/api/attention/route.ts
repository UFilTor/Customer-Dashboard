import { NextRequest, NextResponse } from "next/server";
import { fetchOverdueInvoices, fetchOverdueTasks, fetchHealthScoreIssues, fetchGoneQuiet } from "@/lib/attention";
import { Cache } from "@/lib/cache";
import { AttentionResponse } from "@/lib/types";

const attentionCache = new Cache<AttentionResponse>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  if (!refresh) {
    const cached = attentionCache.get("attention");
    if (cached) return NextResponse.json(cached);
  }

  try {
    const [overdueInvoices, overdueTasks, healthScore, goneQuiet] = await Promise.all([
      fetchOverdueInvoices(),
      fetchOverdueTasks(),
      fetchHealthScoreIssues(),
      fetchGoneQuiet(),
    ]);

    const response: AttentionResponse = {
      groups: [
        { signal: "overdue_invoices" as const, label: "Overdue Invoices", companies: overdueInvoices },
        { signal: "overdue_tasks" as const, label: "Overdue Tasks", companies: overdueTasks },
        { signal: "health_score" as const, label: "Health Score Issues", companies: healthScore },
        { signal: "gone_quiet" as const, label: "Gone Quiet", companies: goneQuiet },
      ].filter((g) => g.companies.length > 0),
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
