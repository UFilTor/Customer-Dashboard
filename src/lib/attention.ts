import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { searchObjectsPage } from "./hubspot-search";
import { getDealStages } from "./hubspot";
import { AttentionCompany } from "./types";
import { TO_EUR } from "./fx";

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

type PropertyHistoryEntry = { value: string; timestamp: string };

// Batched replacement for per-company `?propertiesWithHistory=health_score`
// GETs: one companies batch/read returns history for up to 100 ids per call.
async function fetchHealthScoreHistoryBatch(
  companyIds: string[]
): Promise<Record<string, PropertyHistoryEntry[]>> {
  const map: Record<string, PropertyHistoryEntry[]> = {};
  if (companyIds.length === 0) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < companyIds.length; i += 100) {
    chunks.push(companyIds.slice(i, i + 100));
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/batch/read`, {
          method: "POST",
          headers: hubspotHeaders(),
          body: JSON.stringify({
            inputs: chunk.map((id) => ({ id })),
            properties: ["health_score"],
            propertiesWithHistory: ["health_score"],
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        for (const c of data.results || []) {
          const history = c.propertiesWithHistory?.["health_score"];
          if (history) map[c.id] = history;
        }
      } catch { /* continue without history */ }
    })
  );
  return map;
}

// Batched replacement for per-company `fetchDealForCompany`: one v4
// associations batch/read (company -> deals) plus deals batch/read chunks.
async function fetchLifecycleDealsBatch(
  companyIds: string[]
): Promise<Record<string, Record<string, string>>> {
  const result: Record<string, Record<string, string>> = {};
  if (companyIds.length === 0) return result;
  try {
    const pipelineIds = (process.env.HUBSPOT_LIFECYCLE_PIPELINE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

    const dealIdsByCompany: Record<string, string[]> = {};
    const allDealIds = new Set<string>();
    const assocChunks: string[][] = [];
    for (let i = 0; i < companyIds.length; i += 100) {
      assocChunks.push(companyIds.slice(i, i + 100));
    }
    await Promise.all(
      assocChunks.map(async (chunk) => {
        const assocRes = await fetch(
          `${HUBSPOT_API}/crm/v4/associations/companies/deals/batch/read`,
          {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
          }
        );
        if (!assocRes.ok) return;
        const assocData = await assocRes.json();
        for (const row of assocData.results || []) {
          const ids = (row.to || []).map((t: { toObjectId: number | string }) => String(t.toObjectId));
          dealIdsByCompany[String(row.from?.id)] = ids;
          for (const id of ids) allDealIds.add(id);
        }
      })
    );

    const dealProps: Record<string, Record<string, string>> = {};
    const dealIdList = Array.from(allDealIds);
    const dealChunks: string[][] = [];
    for (let i = 0; i < dealIdList.length; i += 100) {
      dealChunks.push(dealIdList.slice(i, i + 100));
    }
    await Promise.all(
      dealChunks.map(async (chunk) => {
        const batchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/batch/read`, {
          method: "POST",
          headers: hubspotHeaders(),
          body: JSON.stringify({
            inputs: chunk.map((id) => ({ id })),
            properties: ["confirmed__contract_mrr", "currency", "pipeline", "booking_fee", "understory_pay_status__customer", "subscription_plan", "dealstage", "amount_in_home_currency"],
          }),
        });
        if (!batchRes.ok) return;
        const batchData = await batchRes.json();
        for (const d of batchData.results || []) {
          dealProps[d.id] = d.properties;
        }
      })
    );

    for (const [companyId, dealIds] of Object.entries(dealIdsByCompany)) {
      const match = dealIds
        .map((id) => dealProps[id])
        .find((p) => p && pipelineIds.includes(p.pipeline));
      if (match) result[companyId] = match;
    }
    return result;
  } catch {
    return result;
  }
}

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
    dealProps?.currency,
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

// Paginate a HubSpot search through the shared retry helper, capped at
// maxPages (HubSpot refuses paging past 10k results with a 400, and an
// unbounded walk could loop forever on a repeated cursor). Throws on a
// first-page failure so callers / caches reject empty datasets, but keeps
// what it has if a later page fails terminally: partial data beats a
// permanently 500ing route once a result set outgrows the paging wall.
async function searchAllPages<T = { id: string; properties: Record<string, string> }>(
  objectType: string,
  body: Record<string, unknown>,
  maxPages = 20
): Promise<T[]> {
  const all: T[] = [];
  let after: string | undefined;
  for (let pageNo = 0; pageNo < maxPages; pageNo++) {
    let page;
    try {
      page = await searchObjectsPage<T>(objectType, after ? { ...body, after } : body);
    } catch (err) {
      if (pageNo === 0) throw err;
      break;
    }
    all.push(...page.results);
    after = page.nextAfter;
    if (!after) break;
  }
  return all;
}

// Batched deal -> primary company association lookup via the v4 batch API.
// Chunks of 100, chunks fetched in parallel. Throws on failed chunk so a
// partial map never gets cached.
async function fetchDealCompanyAssociations(
  dealIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (dealIds.length === 0) return map;
  const chunks: string[][] = [];
  for (let i = 0; i < dealIds.length; i += 100) {
    chunks.push(dealIds.slice(i, i + 100));
  }
  await Promise.all(
    chunks.map(async (chunk) => {
      const res = await fetch(
        `${HUBSPOT_API}/crm/v4/associations/deals/companies/batch/read`,
        {
          method: "POST",
          headers: hubspotHeaders(),
          body: JSON.stringify({ inputs: chunk.map((id) => ({ id })) }),
        }
      );
      if (!res.ok) {
        throw new Error(`HubSpot deals->companies associations batch read ${res.status}`);
      }
      const data = await res.json();
      for (const row of data.results || []) {
        const companyId = row.to?.[0]?.toObjectId;
        if (companyId !== undefined) {
          map.set(String(row.from?.id), String(companyId));
        }
      }
    })
  );
  return map;
}

export async function fetchInvoices(): Promise<{ overdue: AttentionCompany[]; open: AttentionCompany[] }> {
  const pipelineIds = (process.env.HUBSPOT_LIFECYCLE_PIPELINE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  // Empty filterGroups would match every deal in the portal; bail instead.
  if (pipelineIds.length === 0) {
    return { overdue: [], open: [] };
  }
  const searchResults = await searchAllPages("deals", {
    filterGroups: pipelineIds.map((pid) => ({
      filters: [
        { propertyName: "pipeline", operator: "EQ", value: pid },
        { propertyName: "understory_number_of_unpaid_invoices", operator: "GT", value: "0" },
      ],
    })),
    properties: ["confirmed__contract_mrr", "currency", "deal_currency_code", "booking_fee", "understory_unpaid_amount_local_currency", "understory_earliest_unpaid_invoice_due_date", "understory_number_of_unpaid_invoices", "understory_pay_status__customer", "subscription_plan"],
    sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
    limit: 100,
  });
  const emptyResult = { overdue: [] as AttentionCompany[], open: [] as AttentionCompany[] };

  interface DealInfo { id: string; mrr: string; currency: string; bookingFee: string; outstandingAmount: string; invoiceDueDate: string; openInvoices: number; payStatus: string }
    const deals: DealInfo[] = searchResults.map(
      (d: { id: string; properties: Record<string, string> }) => ({
        id: d.id,
        mrr: d.properties.confirmed__contract_mrr || "",
        currency: d.properties.deal_currency_code || d.properties.currency || "EUR",
        bookingFee: d.properties.booking_fee || "",
        outstandingAmount: d.properties.understory_unpaid_amount_local_currency || "",
        invoiceDueDate: d.properties.understory_earliest_unpaid_invoice_due_date || "",
        openInvoices: parseInt(d.properties.understory_number_of_unpaid_invoices || "0") || 0,
        payStatus: d.properties.understory_pay_status__customer || "",
      })
    );

    if (deals.length === 0) return emptyResult;

    // Batch-read deal->company associations (v4 API, chunks of 100 in parallel)
    const dealCompanyMap = await fetchDealCompanyAssociations(deals.map((d) => d.id));
    const assocResults: ({ companyId: string; deal: DealInfo } | null)[] = deals.map((deal) => {
      const companyId = dealCompanyMap.get(deal.id);
      return companyId ? { companyId, deal } : null;
    });

    // Aggregate every open-invoice deal per company. A company is "overdue"
    // when at least one of its deals is past understory_earliest_unpaid_invoice_due_date; daysOverdue
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
        if (entry._dealCurrency) dealProps.currency = entry._dealCurrency;
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
}

export async function fetchHealthScoreIssues(): Promise<AttentionCompany[]> {
    // Cap at 5 pages (500 companies): downstream history + deal batch fetches
    // fan out per 100 companies, and the UI group is unusable far before 500.
    const searchResults = await searchAllPages("companies", {
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
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
    }, 5);

    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    const companies: (AttentionCompany & { _bookingVolume?: string; _createdate?: string })[] = searchResults.map(
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

    // Fetch property history and ACV for all companies via three batched
    // calls instead of 4 sequential round-trips per company.
    const toExcludeImproved = new Set<string>();
    const companyIds = notRecentlyContacted.map((c) => c.id);

    const [historyMap, dealsByCompany] = await Promise.all([
      fetchHealthScoreHistoryBatch(companyIds),
      fetchLifecycleDealsBatch(companyIds),
    ]);

    for (const company of notRecentlyContacted) {
      const history = historyMap[company.id];
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

      const deal = dealsByCompany[company.id];
      if (deal) {
        const acv = parseFloat(deal.amount_in_home_currency || "0") || 0;
        company.mrr = formatRevenue(acv);
        company.revenue = acv || undefined;
        company.currency = "EUR";
        company.payStatus = deal.understory_pay_status__customer || undefined;
      }
    }

    // Remove companies whose score improved 15+ points in the last 14 days
    return notRecentlyContacted.filter((company) => !toExcludeImproved.has(company.id));
}

const ACTIVE_LIFECYCLE_LABELS = ["adopted", "started", "ramp up", "established"];
const RETENTION_PIPELINE = "1072518362";

export async function fetchNoFutureEvents(): Promise<AttentionCompany[]> {
    // Step 1: Get stage map and find active retention stage IDs
    const stageMap = await getDealStages();
    const activeStageIds = Object.entries(stageMap)
      .filter(([, label]) => ACTIVE_LIFECYCLE_LABELS.includes(label.toLowerCase()))
      .map(([id]) => id);

    if (activeStageIds.length === 0) return [];

    // Step 2: Query deals in Customer retention pipeline with active stages
    // (paginated through the shared retry helper; throws on terminal failure)
    const allDeals = await searchAllPages("deals", {
      filterGroups: [{
        filters: [
          { propertyName: "pipeline", operator: "EQ", value: RETENTION_PIPELINE },
          { propertyName: "dealstage", operator: "IN", values: activeStageIds },
        ],
      }],
      properties: ["dealname", "confirmed__contract_mrr", "currency", "booking_fee", "understory_pay_status__customer", "subscription_plan", "pipeline", "amount_in_home_currency"],
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
    });

    if (allDeals.length === 0) return [];

    // Step 3: Batch-read deal-to-company associations (v4 API, up to 100 per request)
    const companyToDeal = new Map<string, { id: string; properties: Record<string, string> }>();
    const dealMap = new Map(allDeals.map((d) => [d.id, d]));

    const assocChunks: { id: string }[][] = [];
    for (let i = 0; i < allDeals.length; i += 100) {
      assocChunks.push(allDeals.slice(i, i + 100).map((d) => ({ id: d.id })));
    }
    const assocResponses = await Promise.all(
      assocChunks.map(async (inputs) => {
        const res = await fetch(
          `${HUBSPOT_API}/crm/v4/associations/deals/companies/batch/read`,
          {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({ inputs }),
          }
        );
        if (!res.ok) {
          throw new Error(`HubSpot deals->companies associations batch read ${res.status}`);
        }
        return await res.json();
      })
    );
    for (const data of assocResponses) {
      for (const result of data?.results || []) {
        const deal = dealMap.get(String(result.from.id));
        if (!deal) continue;
        for (const to of result.to || []) {
          const companyId = String(to.toObjectId);
          if (!companyToDeal.has(companyId)) {
            companyToDeal.set(companyId, deal);
          }
        }
      }
    }

    const companyIds = Array.from(companyToDeal.keys());
    if (companyIds.length === 0) return [];

    // Step 4: Batch-read company properties including upcoming events
    const companyProps: Record<string, Record<string, string>> = {};
    const companyChunks: string[][] = [];
    for (let i = 0; i < companyIds.length; i += 100) {
      companyChunks.push(companyIds.slice(i, i + 100));
    }
    await Promise.all(
      companyChunks.map(async (batch) => {
        try {
          const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/batch/read`, {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({
              inputs: batch.map((id) => ({ id })),
              properties: ["name", "hubspot_owner_id", "understory_company_country", "createdate", "understory_health_score_upcoming_events", "understory_latest_event", ...CHIP_COMPANY_PROPS],
            }),
          });
          if (!res.ok) return;
          const data = await res.json();
          for (const c of data.results || []) {
            companyProps[c.id] = c.properties;
          }
        } catch { /* skip */ }
      })
    );


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
}

