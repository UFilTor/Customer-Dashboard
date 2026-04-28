import { NextRequest, NextResponse } from "next/server";
import { fetchInvoices, fetchHealthScoreIssues, fetchNoFutureEvents } from "@/lib/attention";
import { Cache } from "@/lib/cache";
import { AttentionCompany, AttentionResponse } from "@/lib/types";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";

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
  const spans = createSpans();

  if (!refresh) {
    const cached = attentionCache.get("attention");
    if (cached) {
      spans.push({ label: "cache.hit", ms: 0 });
      logSpans("attention", spans);
      return NextResponse.json(cached, {
        headers: { "Server-Timing": serverTimingHeader(spans) },
      });
    }
  }

  try {
    const response = await attentionCache.getOrBuild("attention", async () => {
      const [invoices, healthScore, noFutureEvents] = await Promise.all([
        withTiming(spans, "hubspot.invoices", () => fetchInvoices()),
        withTiming(spans, "hubspot.healthScore", () => fetchHealthScoreIssues()),
        withTiming(spans, "hubspot.noFutureEvents", () => fetchNoFutureEvents()),
      ]);

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

      return {
        groups: enrichedGroups,
        updatedAt: new Date().toISOString(),
      };
    });
    logSpans("attention", spans);
    return NextResponse.json(response, {
      headers: { "Server-Timing": serverTimingHeader(spans) },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load attention data" },
      { status: 500 }
    );
  }
}
