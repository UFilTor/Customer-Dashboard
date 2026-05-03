import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { getDealStages } from "./hubspot";
import { AttentionCompany } from "./types";

const CHIP_COMPANY_PROPS = [
  "health_score",
  "understory_booking_volume_12m",
  "understory_booking_volume_3m",
  "understory_booking_volume_6m",
  "createdate",
  // Surfaced as a row context strip on Briefing/Split rows so users don't
  // have to click into detail to see when they last reached out.
  "notes_last_contacted",
];

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
      { headers: hubspotHeaders(), cache: "no-store" as RequestCache }
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
        properties: ["confirmed__contract_mrr", "deal_currency_code", "pipeline", "booking_fee", "understory_pay_status__customer", "subscription_plan", "dealstage", "amount_in_home_currency"],
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

export const TO_EUR: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, SEK: 0.087, NOK: 0.086, DKK: 0.134,
};

export function computeGeneratedRevenue(
  bookingVolume12m: string | undefined,
  bookingFee: string | undefined,
  contractMrr: string | undefined,
  currency: string | undefined,
  createdate?: string | undefined
): number {
  const volume = parseFloat(bookingVolume12m || "0") || 0;
  const fee = parseFloat(bookingFee || "0") || 0;
  const mrr = parseFloat(contractMrr || "0") || 0;
  const mrrRate = TO_EUR[(currency || "EUR").toUpperCase()] ?? 1;
  const createTime = createdate ? new Date(createdate).getTime() : 0;
  const monthsAsCustomer = createTime > 0
    ? Math.min(12, Math.floor((Date.now() - createTime) / (30.44 * 24 * 60 * 60 * 1000)))
    : 12;
  const bookingFeeRevenue = volume * fee;
  const mrrRevenue = mrr * monthsAsCustomer * mrrRate;
  return Math.round(bookingFeeRevenue + mrrRevenue);
}

function formatRevenue(revenueEur: number): string {
  if (revenueEur === 0) return "-";
  const formatted = Math.round(revenueEur).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `\u20ac${formatted}`;
}

function mapChipFields(
  companyProps: Record<string, string>,
  dealProps: Record<string, string> | null
): Pick<AttentionCompany, "healthScore" | "volume12m" | "volume3m" | "volume6m" | "payStatus" | "revenue" | "plan" | "lastContactedAt"> {
  const revenue = computeGeneratedRevenue(
    companyProps.understory_booking_volume_12m,
    dealProps?.booking_fee || dealProps?.confirmed_booking_fee,
    dealProps?.confirmed__contract_mrr,
    dealProps?.deal_currency_code,
    companyProps.createdate
  );
  return {
    healthScore: companyProps.health_score || undefined,
    volume12m: parseFloat(companyProps.understory_booking_volume_12m || "0") || undefined,
    volume3m: parseFloat(companyProps.understory_booking_volume_3m || "0") || undefined,
    volume6m: parseFloat(companyProps.understory_booking_volume_6m || "0") || undefined,
    payStatus: dealProps?.understory_pay_status__customer || undefined,
    plan: dealProps?.subscription_plan || undefined,
    lastContactedAt: companyProps.notes_last_contacted || undefined,
    revenue: revenue || undefined,
  };
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
        properties: ["confirmed__contract_mrr", "deal_currency_code", "booking_fee", "outstanding_amount", "invoice_due_date", "number_of_open_invoices", "understory_pay_status__customer", "subscription_plan"],
        limit: 100,
      }),
    });
    const emptyResult = { overdue: [] as AttentionCompany[], open: [] as AttentionCompany[] };
    if (!res.ok) return emptyResult;
    const data = await res.json();

    interface DealInfo { id: string; mrr: string; currency: string; bookingFee: string; outstandingAmount: string; invoiceDueDate: string; openInvoices: number; payStatus: string }
    const deals: DealInfo[] = data.results?.map(
      (d: { id: string; properties: Record<string, string> }) => ({
        id: d.id,
        mrr: d.properties.confirmed__contract_mrr || "",
        currency: d.properties.deal_currency_code || "EUR",
        bookingFee: d.properties.booking_fee || "",
        outstandingAmount: d.properties.outstanding_amount || "",
        invoiceDueDate: d.properties.invoice_due_date || "",
        openInvoices: parseInt(d.properties.number_of_open_invoices || "0") || 0,
        payStatus: d.properties.understory_pay_status__customer || "",
      })
    ) || [];

    if (deals.length === 0) return emptyResult;

    // Fetch deal->company associations in batches of 5 to avoid rate limits
    const assocResults: ({ companyId: string; deal: DealInfo } | null)[] = [];
    for (let i = 0; i < deals.length; i += 5) {
      const batch = deals.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (deal) => {
          try {
            const assocRes = await fetch(
              `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/companies`,
              { headers: hubspotHeaders(), cache: "no-store" as RequestCache }
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

    // Aggregate every open-invoice deal per company. A company is "overdue"
    // when at least one of its deals is past invoice_due_date; daysOverdue
    // becomes the oldest of those (max). outstandingLocal sums per currency
    // and is reported only when every deal shares one currency — mixed-
    // currency companies surface only the EUR total.
    interface CompanyAcc {
      sumEur: number;
      sumOpenInvoices: number;
      maxDaysOverdue: number | undefined;
      perCurrency: Map<string, number>;
      // Deal props from the first deal we encountered, used later for
      // mapChipFields / generated-revenue computation. Not fully accurate
      // when a company has multiple deals but matches today's behaviour.
      dealMrr: string;
      dealCurrency: string;
      dealBookingFee: string;
      payStatus: string;
    }
    const acc = new Map<string, CompanyAcc>();
    const today = new Date().toISOString().split("T")[0];
    for (const result of assocResults) {
      if (!result) continue;
      const { companyId, deal } = result;
      const outstandingNum = parseFloat(deal.outstandingAmount) || 0;
      const rate = TO_EUR[(deal.currency || "EUR").toUpperCase()] ?? 1;
      const outstandingEur = Math.round(outstandingNum * rate);
      const isOverdue = deal.invoiceDueDate ? deal.invoiceDueDate < today : false;
      const daysOverdue = isOverdue && deal.invoiceDueDate
        ? Math.floor((Date.now() - new Date(deal.invoiceDueDate).getTime()) / 86400000)
        : undefined;

      const existing = acc.get(companyId);
      if (existing) {
        existing.sumEur += outstandingEur;
        existing.sumOpenInvoices += deal.openInvoices;
        if (daysOverdue !== undefined) {
          existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue ?? 0, daysOverdue);
        }
        if (outstandingNum > 0) {
          const ccy = deal.currency || "EUR";
          existing.perCurrency.set(ccy, (existing.perCurrency.get(ccy) ?? 0) + outstandingNum);
        }
      } else {
        const perCurrency = new Map<string, number>();
        if (outstandingNum > 0) perCurrency.set(deal.currency || "EUR", outstandingNum);
        acc.set(companyId, {
          sumEur: outstandingEur,
          sumOpenInvoices: deal.openInvoices,
          maxDaysOverdue: daysOverdue,
          perCurrency,
          dealMrr: deal.mrr,
          dealCurrency: deal.currency,
          dealBookingFee: deal.bookingFee,
          payStatus: deal.payStatus,
        });
      }
    }

    const companyMap = new Map<string, AttentionCompany & { _dealMrr: string; _dealCurrency: string; _dealBookingFee: string; _payStatus: string; _isOverdue: boolean }>();
    for (const [companyId, a] of acc.entries()) {
      const isMixedCurrency = a.perCurrency.size > 1;
      let localSum: number | undefined;
      let localCurrency: string | undefined;
      if (!isMixedCurrency && a.perCurrency.size === 1) {
        const [[ccy, sum]] = Array.from(a.perCurrency.entries());
        localSum = Math.round(sum);
        localCurrency = ccy;
      }
      // Detail line intentionally empty — the section header already says
      // "Overdue invoices" / "Open invoices" and the right-side pill carries
      // the days/amount/count. The lifecycle deal name (e.g. "Acme Customer
      // Lifecycle deal") was just the company name with a noisy suffix.
      companyMap.set(companyId, {
        id: companyId,
        name: "",
        detail: "",
        mrr: a.sumEur > 0 ? formatRevenue(a.sumEur) : "-",
        currency: "EUR",
        daysOverdue: a.maxDaysOverdue,
        outstandingLocal: localSum,
        outstandingCurrency: localCurrency,
        outstandingEur: a.sumEur > 0 ? a.sumEur : undefined,
        openInvoiceCount: a.sumOpenInvoices > 0 ? a.sumOpenInvoices : undefined,
        _dealMrr: a.dealMrr,
        _dealCurrency: a.dealCurrency,
        _dealBookingFee: a.dealBookingFee,
        _payStatus: a.payStatus,
        _isOverdue: a.maxDaysOverdue !== undefined,
      });
    }

    if (companyMap.size === 0) return emptyResult;

    const companies = await fetchCompanyBatch(Array.from(companyMap.keys()), ["understory_company_country", ...CHIP_COMPANY_PROPS]);
    for (const [id, props] of Object.entries(companies)) {
      const entry = companyMap.get(id) as (AttentionCompany & { _dealMrr?: string; _dealCurrency?: string; _dealBookingFee?: string; _payStatus?: string }) | undefined;
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
            entry._dealCurrency,
            props.createdate
          );
          entry.mrr = formatRevenue(revenue);
        }
        entry.currency = "EUR";
        const dealProps: Record<string, string> = {};
        if (entry._dealBookingFee) dealProps.booking_fee = entry._dealBookingFee;
        if (entry._dealMrr) dealProps.confirmed__contract_mrr = entry._dealMrr;
        if (entry._dealCurrency) dealProps.deal_currency_code = entry._dealCurrency;
        if (entry._payStatus) dealProps.understory_pay_status__customer = entry._payStatus;
        const chipFields = mapChipFields(props, Object.keys(dealProps).length > 0 ? dealProps : null);
        Object.assign(entry, chipFields);
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
        properties: ["name", "health_score", "hubspot_owner_id", "understory_booking_volume_12m", "understory_booking_volume_3m", "understory_booking_volume_6m", "understory_company_country", "notes_last_contacted", "createdate"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    const companies: (AttentionCompany & { _bookingVolume?: string; _createdate?: string })[] = (data.results || []).map(
      (c: { id: string; properties: Record<string, string> }) => ({
        id: c.id,
        name: c.properties.name || "Unknown",
        // Detail line intentionally left empty — the pill on the right
        // carries the labelled health score, and the section header says
        // "Health decline". Repeating the raw number under the company
        // name was duplicative.
        detail: "",
        ownerId: c.properties.hubspot_owner_id || "",
        country: c.properties.understory_company_country || "",
        _bookingVolume: c.properties.understory_booking_volume_12m || "",
        _createdate: c.properties.createdate || "",
        _notesLastContacted: c.properties.notes_last_contacted || "",
        ...mapChipFields(c.properties, null),
      })
    );

    // Exclude companies contacted in the last 14 days
    const notRecentlyContacted = companies.filter((company) => {
      const lastContacted = (company as AttentionCompany & { _notesLastContacted?: string })._notesLastContacted;
      if (!lastContacted) return true;
      const contactedAt = new Date(lastContacted).getTime();
      return isNaN(contactedAt) || contactedAt < fourteenDaysAgo;
    });

    // Fetch property history and ACV for each company (batched to avoid rate limits)
    const toExcludeImproved = new Set<string>();

    for (let i = 0; i < notRecentlyContacted.length; i += 5) {
      const batch = notRecentlyContacted.slice(i, i + 5);
      await Promise.all(
        batch.map(async (company) => {
        try {
          // Get health score property history
          const histRes = await fetch(
            `${HUBSPOT_API}/crm/v3/objects/companies/${company.id}?propertiesWithHistory=health_score`,
            { headers: hubspotHeaders(), cache: "no-store" as RequestCache }
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

        // Get ACV from lifecycle deal for sorting
        const deal = await fetchDealForCompany(company.id);
        if (deal) {
          const acv = parseFloat(deal.amount_in_home_currency || "0") || 0;
          company.mrr = formatRevenue(acv);
          company.revenue = acv || undefined;
          company.currency = "EUR";
          company.payStatus = deal.understory_pay_status__customer || undefined;
        }
      })
      );
    }

    // Remove companies whose score improved 15+ points in the last 14 days
    return notRecentlyContacted.filter((company) => !toExcludeImproved.has(company.id));
  } catch {
    return [];
  }
}

const ACTIVE_LIFECYCLE_LABELS = ["adopted", "started", "ramp up", "established"];
const RETENTION_PIPELINE = "1072518362";

export async function fetchNoFutureEvents(): Promise<AttentionCompany[]> {
  try {
    // Step 1: Get stage map and find active retention stage IDs
    const stageMap = await getDealStages();
    const activeStageIds = Object.entries(stageMap)
      .filter(([, label]) => ACTIVE_LIFECYCLE_LABELS.includes(label.toLowerCase()))
      .map(([id]) => id);

    if (activeStageIds.length === 0) return [];

    // Step 2: Query deals in Customer retention pipeline with active stages (paginated)
    const allDeals: { id: string; properties: Record<string, string> }[] = [];
    let after: string | undefined;
    do {
      const body: Record<string, unknown> = {
        filterGroups: [{
          filters: [
            { propertyName: "pipeline", operator: "EQ", value: RETENTION_PIPELINE },
            { propertyName: "dealstage", operator: "IN", values: activeStageIds },
          ],
        }],
        properties: ["dealname", "confirmed__contract_mrr", "deal_currency_code", "booking_fee", "understory_pay_status__customer", "subscription_plan", "pipeline", "amount_in_home_currency"],
        limit: 100,
      };
      if (after) body.after = after;

      const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
        method: "POST",
        headers: hubspotHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) break;
      const data = await res.json();
      allDeals.push(...(data.results || []));
      after = data.paging?.next?.after;
    } while (after);

    if (allDeals.length === 0) return [];

    // Step 3: Batch-read deal-to-company associations (v4 API, up to 100 per request)
    const companyToDeal = new Map<string, { id: string; properties: Record<string, string> }>();
    const dealMap = new Map(allDeals.map((d) => [d.id, d]));

    for (let i = 0; i < allDeals.length; i += 50) {
      const batch = allDeals.slice(i, i + 50);
      try {
        const res = await fetch(
          `${HUBSPOT_API}/crm/v4/associations/deals/companies/batch/read`,
          {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({ inputs: batch.map((d) => ({ id: d.id })) }),
          }
        );
        if (!res.ok) continue;
        const data = await res.json();
        for (const result of data.results || []) {
          const deal = dealMap.get(String(result.from.id));
          if (!deal) continue;
          for (const to of result.to || []) {
            const companyId = String(to.toObjectId);
            if (!companyToDeal.has(companyId)) {
              companyToDeal.set(companyId, deal);
            }
          }
        }
      } catch { /* skip */ }
    }

    const companyIds = Array.from(companyToDeal.keys());
    if (companyIds.length === 0) return [];

    // Step 4: Batch-read company properties including upcoming events
    const companyProps: Record<string, Record<string, string>> = {};
    for (let i = 0; i < companyIds.length; i += 100) {
      const batch = companyIds.slice(i, i + 100);
      try {
        const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/batch/read`, {
          method: "POST",
          headers: hubspotHeaders(),
          body: JSON.stringify({
            inputs: batch.map((id) => ({ id })),
            properties: ["name", "hubspot_owner_id", "understory_company_country", "createdate", "understory_health_score_upcoming_events", "understory_latest_event", ...CHIP_COMPANY_PROPS],
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        for (const c of data.results || []) {
          companyProps[c.id] = c.properties;
        }
      } catch { /* skip */ }
    }

    // Step 5: Filter to companies with 0 upcoming events and build results
    const results: AttentionCompany[] = [];
    for (const [companyId, deal] of companyToDeal.entries()) {
      const props = companyProps[companyId];
      if (!props) continue;

      const rawEvents = props.understory_health_score_upcoming_events;
      const upcomingEvents = parseFloat(rawEvents || "");
      // Include if field is 0 or not set (null/empty = no events scheduled)
      if (!isNaN(upcomingEvents) && upcomingEvents > 0) continue;

      const acv = parseFloat(deal.properties.amount_in_home_currency || "0") || 0;

      results.push({
        id: companyId,
        name: props.name || "Unknown",
        // Detail line intentionally empty — the section header already says
        // "No future events" and the right-side pill carries the latest-
        // event date. Repeating "No upcoming events" was redundant.
        detail: "",
        ownerId: props.hubspot_owner_id || "",
        country: props.understory_company_country || "",
        currency: "EUR",
        ...mapChipFields(props, null),
        latestEventAt: props.understory_latest_event || undefined,
        mrr: formatRevenue(acv),
        revenue: acv || undefined,
        payStatus: deal.properties.understory_pay_status__customer || undefined,
      });
    }

    return results.sort((a, b) => (b.revenue || 0) - (a.revenue || 0));
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
        properties: ["dealname", "churn_reason", "churned_reason_elaborated", "churn_date", "customer_stage", "deal_currency_code", "confirmed__contract_mrr", "booking_fee", "understory_pay_status__customer", "subscription_plan"],
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
    const assocResults: ({ companyId: string; deal: { dealname: string; churnReason: string; churnDetail: string; stage: string; payStatus: string; bookingFee: string; mrr: string; currency: string } } | null)[] = [];
    for (let i = 0; i < activeDeals.length; i += 5) {
      const batch = activeDeals.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (deal: { id: string; properties: Record<string, string> }) => {
          try {
            const assocRes = await fetch(
              `${HUBSPOT_API}/crm/v3/objects/deals/${deal.id}/associations/companies`,
              { headers: hubspotHeaders(), cache: "no-store" as RequestCache }
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
                payStatus: deal.properties.understory_pay_status__customer || "",
                bookingFee: deal.properties.booking_fee || "",
                mrr: deal.properties.confirmed__contract_mrr || "",
                currency: deal.properties.deal_currency_code || "",
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
        payStatus: deal.payStatus || undefined,
        _dealBookingFee: deal.bookingFee,
        _dealMrr: deal.mrr,
        _dealCurrency: deal.currency,
      } as AttentionCompany & { _dealBookingFee: string; _dealMrr: string; _dealCurrency: string });
    }

    if (companyMap.size === 0) return [];

    const companies = await fetchCompanyBatch(Array.from(companyMap.keys()), ["understory_company_country", ...CHIP_COMPANY_PROPS]);
    for (const [id, props] of Object.entries(companies)) {
      const entry = companyMap.get(id);
      if (entry) {
        entry.name = props.name || "Unknown";
        entry.ownerId = props.hubspot_owner_id || "";
        entry.country = props.understory_company_country || "";
        const dealEntry = entry as AttentionCompany & { _dealBookingFee?: string; _dealMrr?: string; _dealCurrency?: string };
        const dealProps: Record<string, string> = {};
        if (dealEntry._dealBookingFee) dealProps.booking_fee = dealEntry._dealBookingFee;
        if (dealEntry._dealMrr) dealProps.confirmed__contract_mrr = dealEntry._dealMrr;
        if (dealEntry._dealCurrency) dealProps.deal_currency_code = dealEntry._dealCurrency;
        const revenue = computeGeneratedRevenue(props.understory_booking_volume_12m, dealProps.booking_fee, dealProps.confirmed__contract_mrr, dealProps.deal_currency_code, props.createdate);
        entry.mrr = revenue > 0 ? formatRevenue(revenue) : "-";
        const chipFields = mapChipFields(props, Object.keys(dealProps).length > 0 ? dealProps : null);
        Object.assign(entry, chipFields);
        // payStatus was set from the deal during association loop; preserve it
        if (!entry.payStatus) {
          entry.payStatus = chipFields.payStatus;
        }
      }
    }

    return Array.from(companyMap.values()).filter((c) => c.name);
  } catch {
    return [];
  }
}

