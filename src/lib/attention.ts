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
    const pipelineIds = (process.env.HUBSPOT_LIFECYCLE_PIPELINE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
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
        properties: ["confirmed__contract_mrr", "deal_currency_code", "pipeline", "booking_fee"],
      }),
    });
    if (!batchRes.ok) return null;
    const batchData = await batchRes.json();

    const deal = batchData.results?.find(
      (d: { properties: Record<string, string> }) => pipelineIds.includes(d.properties.pipeline)
    );
    return deal?.properties || null;
  } catch {
    return null;
  }
}

const TO_EUR: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, SEK: 0.087, NOK: 0.086, DKK: 0.134,
};

function computeGeneratedRevenue(
  bookingVolume12m: string | undefined,
  bookingFee: string | undefined,
  contractMrr: string | undefined,
  currency: string | undefined
): number {
  const volume = parseFloat(bookingVolume12m || "0") || 0;
  const fee = parseFloat(bookingFee || "0") || 0;
  const mrr = parseFloat(contractMrr || "0") || 0;
  const revenueLocal = (volume * fee) + (mrr * 12);
  const rate = TO_EUR[(currency || "EUR").toUpperCase()] ?? 1;
  return Math.round(revenueLocal * rate);
}

function formatRevenue(revenueEur: number): string {
  if (revenueEur === 0) return "-";
  const formatted = Math.round(revenueEur).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `\u20ac${formatted}`;
}

export async function fetchOverdueInvoices(): Promise<AttentionCompany[]> {
  try {
    const pipelineIds = (process.env.HUBSPOT_LIFECYCLE_PIPELINE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        filterGroups: pipelineIds.map((pid) => ({
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: pid },
            { propertyName: "unpaid_invoice", operator: "EQ", value: "true" },
          ],
        })),
        properties: ["dealname", "confirmed__contract_mrr", "deal_currency_code", "booking_fee"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    interface DealInfo { id: string; dealname: string; mrr: string; currency: string; bookingFee: string }
    const deals: DealInfo[] = data.results?.map(
      (d: { id: string; properties: Record<string, string> }) => ({
        id: d.id,
        dealname: d.properties.dealname || "Unknown deal",
        mrr: d.properties.confirmed__contract_mrr || "",
        currency: d.properties.deal_currency_code || "EUR",
        bookingFee: d.properties.booking_fee || "",
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
          _dealMrr: deal.mrr,
          _dealCurrency: deal.currency,
          _dealBookingFee: deal.bookingFee,
        } as AttentionCompany & { _dealMrr: string; _dealCurrency: string; _dealBookingFee: string });
      } catch {
        continue;
      }
    }

    if (companyMap.size === 0) return [];

    const companies = await fetchCompanyBatch(Array.from(companyMap.keys()), ["understory_booking_volume_12m"]);
    for (const [id, props] of Object.entries(companies)) {
      const entry = companyMap.get(id) as (AttentionCompany & { _dealMrr?: string; _dealCurrency?: string; _dealBookingFee?: string }) | undefined;
      if (entry) {
        entry.name = props.name || "Unknown";
        entry.ownerId = props.hubspot_owner_id || "";
        const revenue = computeGeneratedRevenue(
          props.understory_booking_volume_12m,
          entry._dealBookingFee,
          entry._dealMrr,
          entry._dealCurrency
        );
        entry.mrr = formatRevenue(revenue);
        entry.currency = "EUR";
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

    const companyProps = await fetchCompanyBatch(Array.from(companyMap.keys()), ["understory_booking_volume_12m"]);
    for (const [id, props] of Object.entries(companyProps)) {
      const entry = companyMap.get(id);
      if (entry) {
        entry.name = props.name || "Unknown";
        entry.ownerId = props.hubspot_owner_id || "";
        (entry as AttentionCompany & { _bookingVolume?: string })._bookingVolume = props.understory_booking_volume_12m || "";
      }
    }

    // Fetch deal data and compute Generated Revenue for each company
    const results = Array.from(companyMap.values()).filter((c) => c.name);
    await Promise.all(
      results.map(async (company) => {
        const deal = await fetchDealForCompany(company.id);
        if (deal) {
          const bookingVolume = (company as AttentionCompany & { _bookingVolume?: string })._bookingVolume;
          const revenue = computeGeneratedRevenue(bookingVolume, deal.booking_fee, deal.confirmed__contract_mrr, deal.deal_currency_code);
          company.mrr = formatRevenue(revenue);
          company.currency = "EUR";
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
              propertyName: "health_score",
              operator: "LT",
              value: "60",
            }],
          },
        ],
        properties: ["name", "health_score", "hubspot_owner_id", "understory_booking_volume_12m"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const companies: (AttentionCompany & { _bookingVolume?: string })[] = (data.results || []).map(
      (c: { id: string; properties: Record<string, string> }) => ({
        id: c.id,
        name: c.properties.name || "Unknown",
        detail: c.properties["health_score"] || "Unknown",
        ownerId: c.properties.hubspot_owner_id || "",
        _bookingVolume: c.properties.understory_booking_volume_12m || "",
      })
    );

    // Fetch property history and MRR for each company
    await Promise.all(
      companies.map(async (company) => {
        try {
          // Get health score property history
          const histRes = await fetch(
            `${HUBSPOT_API}/crm/v3/objects/companies/${company.id}?propertiesWithHistory=health_score`,
            { headers: hubspotHeaders() }
          );
          if (histRes.ok) {
            const histData = await histRes.json();
            const history = histData.propertiesWithHistory?.["health_score"];
            if (history && history.length >= 2) {
              company.previousCategory = history[1].value;
              company.categoryChangedAt = history[0].timestamp;
            } else if (history && history.length === 1) {
              company.categoryChangedAt = history[0].timestamp;
            }
          }
        } catch { /* continue without history */ }

        // Get Generated Revenue from lifecycle deal
        const deal = await fetchDealForCompany(company.id);
        if (deal) {
          const revenue = computeGeneratedRevenue(company._bookingVolume, deal.booking_fee, deal.confirmed__contract_mrr, deal.deal_currency_code);
          company.mrr = formatRevenue(revenue);
          company.currency = "EUR";
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
        properties: ["name", "notes_last_contacted", "hubspot_owner_id", "understory_booking_volume_12m"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const companies: (AttentionCompany & { _bookingVolume?: string })[] = (data.results || []).map(
      (c: { id: string; properties: Record<string, string> }) => {
        const lastDate = new Date(c.properties.notes_last_contacted);
        const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: c.id,
          name: c.properties.name || "Unknown",
          detail: `Last contacted ${daysAgo} days ago`,
          daysSilent: daysAgo,
          ownerId: c.properties.hubspot_owner_id || "",
          _bookingVolume: c.properties.understory_booking_volume_12m || "",
        };
      }
    );

    // Fetch deal data and compute Generated Revenue for each company
    await Promise.all(
      companies.map(async (company) => {
        const deal = await fetchDealForCompany(company.id);
        if (deal) {
          const revenue = computeGeneratedRevenue(company._bookingVolume, deal.booking_fee, deal.confirmed__contract_mrr, deal.deal_currency_code);
          company.mrr = formatRevenue(revenue);
          company.currency = "EUR";
        }
      })
    );

    // Sort by Generated Revenue descending (higher value customers first)
    return companies.sort((a, b) => {
      const revenueA = parseFloat((a.mrr || "").replace(/[^\d]/g, "")) || 0;
      const revenueB = parseFloat((b.mrr || "").replace(/[^\d]/g, "")) || 0;
      return revenueB - revenueA;
    });
  } catch {
    return [];
  }
}

