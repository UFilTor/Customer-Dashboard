import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { AttentionCompany } from "./types";

async function fetchCompanyBatch(
  companyIds: string[],
  extraProps: string[] = []
): Promise<Record<string, Record<string, string>>> {
  if (companyIds.length === 0) return {};
  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/batch/read`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        inputs: companyIds.map((id) => ({ id })),
        properties: ["name", "hubspot_owner_id", ...extraProps],
      }),
    });
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<string, Record<string, string>> = {};
    for (const c of data.results || []) {
      map[c.id] = c.properties;
    }
    return map;
  } catch {
    return {};
  }
}

async function fetchDealForCompany(companyId: string): Promise<Record<string, string> | null> {
  try {
    const pipelineId = process.env.HUBSPOT_LIFECYCLE_PIPELINE_ID;
    const assocRes = await fetch(
      `${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/deals`,
      { headers: hubspotHeaders() }
    );
    if (!assocRes.ok) return null;
    const assocData = await assocRes.json();
    const dealIds: string[] = assocData.results?.map((r: { id: string }) => r.id) || [];
    if (dealIds.length === 0) return null;

    const batchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/batch/read`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        inputs: dealIds.map((id) => ({ id })),
        properties: ["confirmed__contract_mrr", "deal_currency_code", "pipeline"],
      }),
    });
    if (!batchRes.ok) return null;
    const batchData = await batchRes.json();

    const deal = batchData.results?.find(
      (d: { properties: Record<string, string> }) => d.properties.pipeline === pipelineId
    );
    return deal?.properties || null;
  } catch {
    return null;
  }
}

function getCurrencySymbol(code: string): string {
  const symbols: Record<string, string> = {
    EUR: "\u20ac",
    DKK: "DKK ",
    SEK: "SEK ",
    NOK: "NOK ",
    USD: "$",
    GBP: "\u00a3",
  };
  return symbols[code?.toUpperCase()] || (code ? `${code} ` : "\u20ac");
}

function formatMrr(mrr: string | undefined, currency: string | undefined): string {
  if (!mrr) return "-";
  const num = parseFloat(mrr);
  if (isNaN(num)) return "-";
  const symbol = getCurrencySymbol(currency || "EUR");
  const formatted = Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${symbol}${formatted}/mo`;
}

export async function fetchOverdueInvoices(): Promise<AttentionCompany[]> {
  try {
    const pipelineId = process.env.HUBSPOT_LIFECYCLE_PIPELINE_ID;
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        filterGroups: [{
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: pipelineId },
            { propertyName: "Tags", operator: "CONTAINS_TOKEN", value: "Overdue" },
          ],
        }],
        properties: ["dealname", "confirmed__contract_mrr", "deal_currency_code"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    interface DealInfo { id: string; dealname: string; mrr: string; currency: string }
    const deals: DealInfo[] = data.results?.map(
      (d: { id: string; properties: Record<string, string> }) => ({
        id: d.id,
        dealname: d.properties.dealname || "Unknown deal",
        mrr: d.properties.confirmed__contract_mrr || "",
        currency: d.properties.deal_currency_code || "EUR",
      })
    ) || [];

    if (deals.length === 0) return [];

    const companyMap = new Map<string, AttentionCompany>();

    for (const deal of deals) {
      try {
        const assocRes = await fetch(
          `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/companies`,
          { headers: hubspotHeaders() }
        );
        if (!assocRes.ok) continue;
        const assocData = await assocRes.json();
        const companyId = assocData.results?.[0]?.id;
        if (!companyId || companyMap.has(companyId)) continue;
        companyMap.set(companyId, {
          id: companyId,
          name: "",
          detail: deal.dealname,
          mrr: formatMrr(deal.mrr, deal.currency),
          currency: deal.currency,
        });
      } catch {
        continue;
      }
    }

    if (companyMap.size === 0) return [];

    const companies = await fetchCompanyBatch(Array.from(companyMap.keys()));
    for (const [id, props] of Object.entries(companies)) {
      const entry = companyMap.get(id);
      if (entry) {
        entry.name = props.name || "Unknown";
        entry.ownerId = props.hubspot_owner_id || "";
      }
    }

    return Array.from(companyMap.values()).filter((c) => c.name);
  } catch {
    return [];
  }
}

export async function fetchOverdueTasks(): Promise<AttentionCompany[]> {
  try {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/tasks/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        filterGroups: [{
          filters: [
            { propertyName: "hs_task_due_date", operator: "LT", value: today },
            { propertyName: "hs_task_status", operator: "NEQ", value: "COMPLETED" },
          ],
        }],
        properties: ["hs_task_subject", "hs_task_due_date"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    interface TaskInfo { id: string; subject: string; dueDate: string; daysOverdue: number }
    const tasks: TaskInfo[] = (data.results || []).map(
      (t: { id: string; properties: Record<string, string> }) => {
        const dueDate = t.properties.hs_task_due_date || "";
        const daysOverdue = dueDate
          ? Math.floor((Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        return {
          id: t.id,
          subject: t.properties.hs_task_subject || "Untitled task",
          dueDate,
          daysOverdue,
        };
      }
    );

    if (tasks.length === 0) return [];

    const companyMap = new Map<string, AttentionCompany & { _daysOverdue: number }>();

    for (const task of tasks) {
      try {
        const assocRes = await fetch(
          `${HUBSPOT_API}/crm/v3/objects/tasks/${task.id}/associations/companies`,
          { headers: hubspotHeaders() }
        );
        if (!assocRes.ok) continue;
        const assocData = await assocRes.json();
        const companyId = assocData.results?.[0]?.id;
        if (!companyId) continue;

        const existing = companyMap.get(companyId);
        if (!existing || task.daysOverdue > existing._daysOverdue) {
          companyMap.set(companyId, {
            id: companyId,
            name: "",
            detail: task.subject,
            daysOverdue: task.daysOverdue,
            _daysOverdue: task.daysOverdue,
          });
        }
      } catch {
        continue;
      }
    }

    if (companyMap.size === 0) return [];

    const companies = await fetchCompanyBatch(Array.from(companyMap.keys()));
    for (const [id, props] of Object.entries(companies)) {
      const entry = companyMap.get(id);
      if (entry) {
        entry.name = props.name || "Unknown";
        entry.ownerId = props.hubspot_owner_id || "";
      }
    }

    // Fetch MRR for each company from their lifecycle deal
    const results = Array.from(companyMap.values()).filter((c) => c.name);
    await Promise.all(
      results.map(async (company) => {
        const deal = await fetchDealForCompany(company.id);
        if (deal) {
          company.mrr = formatMrr(deal.confirmed__contract_mrr, deal.deal_currency_code);
          company.currency = deal.deal_currency_code || "EUR";
        }
      })
    );

    return results;
  } catch {
    return [];
  }
}

export async function fetchHealthScoreIssues(): Promise<AttentionCompany[]> {
  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{
              propertyName: "Health Score Category",
              operator: "EQ",
              value: "At Risk",
            }],
          },
          {
            filters: [{
              propertyName: "Health Score Category",
              operator: "EQ",
              value: "Critical Churn Risk",
            }],
          },
        ],
        properties: ["name", "Health Score Category", "hubspot_owner_id"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const companies: AttentionCompany[] = (data.results || []).map(
      (c: { id: string; properties: Record<string, string> }) => ({
        id: c.id,
        name: c.properties.name || "Unknown",
        detail: c.properties["Health Score Category"] || "Unknown",
        ownerId: c.properties.hubspot_owner_id || "",
      })
    );

    // Fetch property history and MRR for each company
    await Promise.all(
      companies.map(async (company) => {
        try {
          // Get health score property history
          const histRes = await fetch(
            `${HUBSPOT_API}/crm/v3/objects/companies/${company.id}?propertiesWithHistory=Health Score Category`,
            { headers: hubspotHeaders() }
          );
          if (histRes.ok) {
            const histData = await histRes.json();
            const history = histData.propertiesWithHistory?.["Health Score Category"];
            if (history && history.length >= 2) {
              company.previousCategory = history[1].value;
              company.categoryChangedAt = history[0].timestamp;
            } else if (history && history.length === 1) {
              company.categoryChangedAt = history[0].timestamp;
            }
          }
        } catch { /* continue without history */ }

        // Get MRR from lifecycle deal
        const deal = await fetchDealForCompany(company.id);
        if (deal) {
          company.mrr = formatMrr(deal.confirmed__contract_mrr, deal.deal_currency_code);
          company.currency = deal.deal_currency_code || "EUR";
        }
      })
    );

    return companies;
  } catch {
    return [];
  }
}

export async function fetchGoneQuiet(): Promise<AttentionCompany[]> {
  try {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 45);
    const thresholdStr = threshold.toISOString().split("T")[0];

    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "notes_last_contacted",
            operator: "LT",
            value: thresholdStr,
          }],
        }],
        properties: ["name", "notes_last_contacted", "hubspot_owner_id"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const companies: AttentionCompany[] = (data.results || []).map(
      (c: { id: string; properties: Record<string, string> }) => {
        const lastDate = new Date(c.properties.notes_last_contacted);
        const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: c.id,
          name: c.properties.name || "Unknown",
          detail: `Last contacted ${daysAgo} days ago`,
          daysSilent: daysAgo,
          ownerId: c.properties.hubspot_owner_id || "",
        };
      }
    );

    // Fetch MRR for each company from lifecycle deal
    await Promise.all(
      companies.map(async (company) => {
        const deal = await fetchDealForCompany(company.id);
        if (deal) {
          company.mrr = formatMrr(deal.confirmed__contract_mrr, deal.deal_currency_code);
          company.currency = deal.deal_currency_code || "EUR";
        }
      })
    );

    // Sort by MRR descending (higher value customers first)
    return companies.sort((a, b) => {
      const mrrA = parseMrrValue(a.mrr);
      const mrrB = parseMrrValue(b.mrr);
      return mrrB - mrrA;
    });
  } catch {
    return [];
  }
}

function parseMrrValue(mrr: string | undefined): number {
  if (!mrr || mrr === "-") return 0;
  const num = parseFloat(mrr.replace(/[^\d.]/g, ""));
  return isNaN(num) ? 0 : num;
}
