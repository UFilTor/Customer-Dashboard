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

export async function fetchInvoices(): Promise<{ overdue: AttentionCompany[]; open: AttentionCompany[] }> {
  try {
    const pipelineIds = (process.env.HUBSPOT_LIFECYCLE_PIPELINE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        filterGroups: pipelineIds.map((pid) => ({
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: pid },
            { propertyName: "number_of_open_invoices", operator: "GT", value: "0" },
          ],
        })),
        properties: ["dealname", "confirmed__contract_mrr", "deal_currency_code", "booking_fee", "outstanding_amount", "invoice_due_date", "number_of_open_invoices"],
        limit: 100,
      }),
    });
    const emptyResult = { overdue: [] as AttentionCompany[], open: [] as AttentionCompany[] };
    if (!res.ok) return emptyResult;
    const data = await res.json();

    interface DealInfo { id: string; dealname: string; mrr: string; currency: string; bookingFee: string; outstandingAmount: string; invoiceDueDate: string; openInvoices: number }
    const deals: DealInfo[] = data.results?.map(
      (d: { id: string; properties: Record<string, string> }) => ({
        id: d.id,
        dealname: d.properties.dealname || "Unknown deal",
        mrr: d.properties.confirmed__contract_mrr || "",
        currency: d.properties.deal_currency_code || "EUR",
        bookingFee: d.properties.booking_fee || "",
        outstandingAmount: d.properties.outstanding_amount || "",
        invoiceDueDate: d.properties.invoice_due_date || "",
        openInvoices: parseInt(d.properties.number_of_open_invoices || "0") || 0,
      })
    ) || [];

    if (deals.length === 0) return emptyResult;

    const companyMap = new Map<string, AttentionCompany & { _dealMrr: string; _dealCurrency: string; _dealBookingFee: string }>();

    // Fetch deal->company associations in batches of 10 to avoid rate limits
    const assocResults: ({ companyId: string; deal: DealInfo } | null)[] = [];
    for (let i = 0; i < deals.length; i += 5) {
      const batch = deals.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (deal) => {
          try {
            const assocRes = await fetch(
              `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/companies`,
              { headers: hubspotHeaders() }
            );
            if (!assocRes.ok) return null;
            const assocData = await assocRes.json();
            const companyId = assocData.results?.[0]?.id;
            return companyId ? { companyId, deal } : null;
          } catch {
            return null;
          }
        })
      );
      assocResults.push(...batchResults);
    }

    const today = new Date().toISOString().split("T")[0];
    for (const result of assocResults) {
      if (!result || companyMap.has(result.companyId)) continue;
      const { companyId, deal } = result;
      const outstandingNum = parseFloat(deal.outstandingAmount) || 0;
      const rate = TO_EUR[(deal.currency || "EUR").toUpperCase()] ?? 1;
      const outstandingEur = Math.round(outstandingNum * rate);
      const isOverdue = deal.invoiceDueDate ? deal.invoiceDueDate < today : false;
      const daysOverdue = isOverdue && deal.invoiceDueDate
        ? Math.floor((Date.now() - new Date(deal.invoiceDueDate).getTime()) / 86400000)
        : undefined;

      companyMap.set(companyId, {
        id: companyId,
        name: "",
        detail: deal.dealname,
        mrr: outstandingEur > 0 ? formatRevenue(outstandingEur) : "-",
        currency: "EUR",
        daysOverdue,
        _dealMrr: deal.mrr,
        _dealCurrency: deal.currency,
        _dealBookingFee: deal.bookingFee,
        _isOverdue: isOverdue,
      } as AttentionCompany & { _dealMrr: string; _dealCurrency: string; _dealBookingFee: string; _isOverdue: boolean });
    }

    if (companyMap.size === 0) return emptyResult;

    const companies = await fetchCompanyBatch(Array.from(companyMap.keys()), ["understory_booking_volume_12m", "understory_company_country"]);
    for (const [id, props] of Object.entries(companies)) {
      const entry = companyMap.get(id) as (AttentionCompany & { _dealMrr?: string; _dealCurrency?: string; _dealBookingFee?: string }) | undefined;
      if (entry) {
        entry.name = props.name || "Unknown";
        entry.ownerId = props.hubspot_owner_id || "";
        entry.country = props.understory_company_country || "";
        // Keep the outstanding amount already set for overdue invoices
        // Only compute generated revenue if mrr wasn't already set
        if (!entry.mrr || entry.mrr === "-") {
          const revenue = computeGeneratedRevenue(
            props.understory_booking_volume_12m,
            entry._dealBookingFee,
            entry._dealMrr,
            entry._dealCurrency
          );
          entry.mrr = formatRevenue(revenue);
        }
        entry.currency = "EUR";
      }
    }

    const all = Array.from(companyMap.values()).filter((c) => c.name) as (AttentionCompany & { _isOverdue?: boolean })[];
    return {
      overdue: all.filter((c) => c._isOverdue === true),
      open: all.filter((c) => c._isOverdue !== true),
    };
  } catch {
    return { overdue: [], open: [] };
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

    // Fetch task->company associations in batches of 10 to avoid rate limits
    const taskAssocResults: ({ companyId: string; task: TaskInfo } | null)[] = [];
    for (let i = 0; i < tasks.length; i += 5) {
      const batch = tasks.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (task) => {
          try {
            const assocRes = await fetch(
              `${HUBSPOT_API}/crm/v3/objects/tasks/${task.id}/associations/companies`,
              { headers: hubspotHeaders() }
            );
            if (!assocRes.ok) return null;
            const assocData = await assocRes.json();
            const companyId = assocData.results?.[0]?.id;
            return companyId ? { companyId, task } : null;
          } catch {
            return null;
          }
        })
      );
      taskAssocResults.push(...batchResults);
    }

    for (const result of taskAssocResults) {
      if (!result) continue;
      const { companyId, task } = result;
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
    }

    if (companyMap.size === 0) return [];

    const companyProps = await fetchCompanyBatch(Array.from(companyMap.keys()), ["understory_booking_volume_12m", "understory_company_country"]);
    for (const [id, props] of Object.entries(companyProps)) {
      const entry = companyMap.get(id);
      if (entry) {
        entry.name = props.name || "Unknown";
        entry.ownerId = props.hubspot_owner_id || "";
        entry.country = props.understory_company_country || "";
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
        properties: ["name", "health_score", "hubspot_owner_id", "understory_booking_volume_12m", "understory_company_country", "notes_last_contacted"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    const companies: (AttentionCompany & { _bookingVolume?: string })[] = (data.results || []).map(
      (c: { id: string; properties: Record<string, string> }) => ({
        id: c.id,
        name: c.properties.name || "Unknown",
        detail: c.properties["health_score"] || "Unknown",
        ownerId: c.properties.hubspot_owner_id || "",
        country: c.properties.understory_company_country || "",
        _bookingVolume: c.properties.understory_booking_volume_12m || "",
        _notesLastContacted: c.properties.notes_last_contacted || "",
      })
    );

    // Exclude companies contacted in the last 14 days
    const notRecentlyContacted = companies.filter((company) => {
      const lastContacted = (company as AttentionCompany & { _notesLastContacted?: string })._notesLastContacted;
      if (!lastContacted) return true;
      const contactedAt = new Date(lastContacted).getTime();
      return isNaN(contactedAt) || contactedAt < fourteenDaysAgo;
    });

    // Fetch property history and MRR for each company
    const toExcludeImproved = new Set<string>();

    await Promise.all(
      notRecentlyContacted.map(async (company) => {
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

              // Exclude if score improved 15+ points within last 14 days
              const changeTimestamp = new Date(history[0].timestamp).getTime();
              const currentScore = parseFloat(history[0].value);
              const previousScore = parseFloat(history[1].value);
              if (
                !isNaN(changeTimestamp) &&
                changeTimestamp >= fourteenDaysAgo &&
                !isNaN(currentScore) &&
                !isNaN(previousScore) &&
                currentScore - previousScore >= 15
              ) {
                toExcludeImproved.add(company.id);
              }
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

    // Remove companies whose score improved 15+ points in the last 14 days
    return notRecentlyContacted.filter((company) => !toExcludeImproved.has(company.id));
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
        properties: ["name", "notes_last_contacted", "hubspot_owner_id", "understory_booking_volume_12m", "understory_company_country"],
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
          country: c.properties.understory_company_country || "",
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

export async function fetchDecliningVolume(): Promise<AttentionCompany[]> {
  try {
    // Search for companies with booking volume data
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "understory_booking_volume_6m",
            operator: "GT",
            value: "0",
          }],
        }],
        properties: ["name", "hubspot_owner_id", "understory_booking_volume_3m", "understory_booking_volume_6m", "understory_booking_volume_12m", "understory_company_country"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const companies: AttentionCompany[] = [];
    for (const c of data.results || []) {
      const m3 = parseFloat(c.properties.understory_booking_volume_3m || "0");
      const m6 = parseFloat(c.properties.understory_booking_volume_6m || "0");
      if (m6 === 0) continue;

      // Previous 3 months = 6m total - current 3m
      const previous3m = m6 - m3;
      if (previous3m <= 0) continue;

      // Flag if current 3m is less than 50% of previous 3m
      if (m3 < previous3m * 0.5) {
        const declinePct = Math.round(((previous3m - m3) / previous3m) * 100);
        companies.push({
          id: c.id,
          name: c.properties.name || "Unknown",
          detail: `Volume down ${declinePct}% vs previous 3 months`,
          ownerId: c.properties.hubspot_owner_id || "",
          country: c.properties.understory_company_country || "",
          mrr: `\u20ac${Math.round(parseFloat(c.properties.understory_booking_volume_12m || "0")).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`,
          currency: "EUR",
        });
      }
    }

    return companies;
  } catch {
    return [];
  }
}

export async function fetchChurnRisk(): Promise<AttentionCompany[]> {
  try {
    const pipelineIds = (process.env.HUBSPOT_LIFECYCLE_PIPELINE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        filterGroups: pipelineIds.map((pid) => ({
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: pid },
            { propertyName: "wish_to_churn", operator: "EQ", value: "true" },
          ],
        })),
        properties: ["dealname", "churn_reason", "churned_reason_elaborated", "churn_date", "customer_stage", "deal_currency_code", "confirmed__contract_mrr", "booking_fee"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    // Only show companies NOT yet churned (active churn risks)
    const activeDeals = (data.results || []).filter(
      (d: { properties: Record<string, string> }) => d.properties.customer_stage !== "Churned"
    );

    if (activeDeals.length === 0) return [];

    const companyMap = new Map<string, AttentionCompany>();

    // Fetch associations in batches of 5
    const assocResults: ({ companyId: string; deal: { dealname: string; churnReason: string; churnDetail: string; stage: string } } | null)[] = [];
    for (let i = 0; i < activeDeals.length; i += 5) {
      const batch = activeDeals.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (deal: { id: string; properties: Record<string, string> }) => {
          try {
            const assocRes = await fetch(
              `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/companies`,
              { headers: hubspotHeaders() }
            );
            if (!assocRes.ok) return null;
            const assocData = await assocRes.json();
            const companyId = assocData.results?.[0]?.id;
            return companyId ? {
              companyId,
              deal: {
                dealname: deal.properties.dealname || "",
                churnReason: deal.properties.churn_reason || "",
                churnDetail: deal.properties.churned_reason_elaborated || "",
                stage: deal.properties.customer_stage || "",
              }
            } : null;
          } catch { return null; }
        })
      );
      assocResults.push(...batchResults);
    }

    for (const result of assocResults) {
      if (!result || companyMap.has(result.companyId)) continue;
      const { companyId, deal } = result;
      const reasonText = deal.churnReason
        ? `${deal.churnReason}${deal.churnDetail ? ` - ${deal.churnDetail.slice(0, 80)}` : ""}`
        : deal.stage || "Wants to churn";
      companyMap.set(companyId, {
        id: companyId,
        name: "",
        detail: reasonText,
        ownerId: "",
        currency: "EUR",
      });
    }

    if (companyMap.size === 0) return [];

    const companies = await fetchCompanyBatch(Array.from(companyMap.keys()), ["understory_booking_volume_12m", "understory_company_country"]);
    for (const [id, props] of Object.entries(companies)) {
      const entry = companyMap.get(id);
      if (entry) {
        entry.name = props.name || "Unknown";
        entry.ownerId = props.hubspot_owner_id || "";
        entry.country = props.understory_company_country || "";
        const volume = parseFloat(props.understory_booking_volume_12m || "0");
        entry.mrr = volume > 0 ? formatRevenue(Math.round(volume)) : "-";
      }
    }

    return Array.from(companyMap.values()).filter((c) => c.name);
  } catch {
    return [];
  }
}

