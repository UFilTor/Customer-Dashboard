import { Cache } from "./cache";
import {
  fetchInvoices,
  fetchHealthScoreIssues,
  fetchNoFutureEvents,
} from "./attention";
import type { AttentionCompany, AttentionResponse } from "./types";

// Shared cache + builder for the attention payload. Imported by both
// `/api/attention/route.ts` (browser-facing) and `src/app/page.tsx` (Server
// Component initial data). Sharing the module instance lets a server-render
// of `/` and a subsequent client refetch of `/api/attention` hit the same
// in-memory cache.
const attentionCache = new Cache<AttentionResponse>(15 * 60 * 1000);

function computeEnteredGroupAt(
  company: AttentionCompany,
  signal: string
): string | undefined {
  const now = Date.now();
  if (
    (signal === "overdue_invoices" || signal === "open_invoices") &&
    company.daysOverdue !== undefined
  ) {
    return new Date(now - company.daysOverdue * 86400000).toISOString();
  }
  if (signal === "health_score" && company.categoryChangedAt) {
    return company.categoryChangedAt;
  }
  return undefined;
}

export function getCachedAttention(): AttentionResponse | null {
  return attentionCache.get("attention");
}

export async function buildAttentionPayload(
  options: { refresh?: boolean } = {}
): Promise<AttentionResponse> {
  if (!options.refresh) {
    const cached = attentionCache.get("attention");
    if (cached) return cached;
  }
  return attentionCache.getOrBuild("attention", async () => {
    const [invoices, healthScore, noFutureEvents] = await Promise.all([
      fetchInvoices(),
      fetchHealthScoreIssues(),
      fetchNoFutureEvents(),
    ]);

    const groups = [
      {
        signal: "overdue_invoices" as const,
        label: "Overdue Invoices",
        companies: invoices.overdue,
      },
      {
        signal: "open_invoices" as const,
        label: "Open Invoices",
        companies: invoices.open,
      },
      {
        signal: "health_score" as const,
        label: "Health Score Issues",
        companies: healthScore,
      },
      {
        signal: "no_future_events" as const,
        label: "No Future Events",
        companies: noFutureEvents,
      },
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
}
