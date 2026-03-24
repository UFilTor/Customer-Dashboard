import { CompanySearchResult, CompanyDetail, Engagement, TaskItem, OwnerMap, StageMap } from "./types";
import { HUBSPOT_API, hubspotHeaders as headers } from "./hubspot-api";

const SEARCH_TO_EUR: Record<string, number> = {
  EUR: 1, USD: 0.92, GBP: 1.16, SEK: 0.087, NOK: 0.086, DKK: 0.134,
};

function computeSearchRevenue(
  bookingVolume12m: string | undefined,
  bookingFee: string | undefined,
  contractMrr: string | undefined,
  currency: string | undefined,
  createdate: string | undefined
): string | undefined {
  const volume = parseFloat(bookingVolume12m || "0") || 0;
  const fee = parseFloat(bookingFee || "0") || 0;
  const mrr = parseFloat(contractMrr || "0") || 0;
  if (volume === 0 && mrr === 0) return undefined;
  const mrrRate = SEARCH_TO_EUR[(currency || "EUR").toUpperCase()] ?? 1;
  const createTime = createdate ? new Date(createdate).getTime() : 0;
  const monthsAsCustomer = createTime > 0
    ? Math.min(12, Math.floor((Date.now() - createTime) / (30.44 * 24 * 60 * 60 * 1000)))
    : 12;
  const bookingFeeRevenue = volume * fee;
  const mrrRevenue = mrr * monthsAsCustomer * mrrRate;
  const eur = Math.round(bookingFeeRevenue + mrrRevenue);
  if (eur === 0) return undefined;
  return `\u20ac${eur.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

export async function searchCompanies(query: string): Promise<CompanySearchResult[]> {
  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        query: query,
        properties: ["name", "domain", "health_score", "understory_booking_volume_12m", "createdate"],
        limit: 5,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    const base: Array<{ id: string; properties: Record<string, string> }> = data.results || [];

    // Enrich each result with deal data for revenue
    const enriched = await Promise.all(
      base.map(async (r) => {
        const healthScore = r.properties["health_score"] || undefined;
        const bookingVolume = r.properties["understory_booking_volume_12m"] || "0";

        let revenue: string | undefined;
        try {
          const assocRes = await fetch(
            `${HUBSPOT_API}/crm/v3/objects/companies/${r.id}/associations/deals`,
            { headers: headers(), cache: "no-store" as RequestCache }
          );
          if (assocRes.ok) {
            const assocData = await assocRes.json();
            const dealIds: string[] = assocData.results?.map((d: { id: string }) => d.id) || [];
            if (dealIds.length > 0) {
              const batchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/batch/read`, {
                method: "POST",
                headers: headers(),
                body: JSON.stringify({
                  inputs: dealIds.map((id) => ({ id })),
                  properties: ["confirmed__contract_mrr", "deal_currency_code", "booking_fee", "confirmed_booking_fee", "pipeline"],
                }),
              });
              if (batchRes.ok) {
                const batchData = await batchRes.json();
                const pipelineIds = (process.env.HUBSPOT_LIFECYCLE_PIPELINE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
                const lifecycleDeal = batchData.results?.find(
                  (d: { properties: Record<string, string> }) =>
                    pipelineIds.includes(d.properties.pipeline)
                );
                if (lifecycleDeal) {
                  revenue = computeSearchRevenue(
                    bookingVolume,
                    lifecycleDeal.properties.booking_fee || lifecycleDeal.properties.confirmed_booking_fee,
                    lifecycleDeal.properties.confirmed__contract_mrr,
                    lifecycleDeal.properties.deal_currency_code,
                    r.properties["createdate"]
                  );
                }
              }
            }
          }
        } catch {
          // Revenue enrichment is best-effort; skip on error
        }

        const result: CompanySearchResult = {
          id: r.id,
          name: r.properties.name,
          domain: r.properties.domain || "",
        };
        if (revenue) result.revenue = revenue;
        if (healthScore) result.healthScore = healthScore;
        return result;
      })
    );

    return enriched;
  } catch {
    return [];
  }
}

export async function getOwners(): Promise<OwnerMap> {
  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/owners`, { headers: headers(), cache: "no-store" as RequestCache });
    if (!res.ok) return {};
    const data = await res.json();
    const map: OwnerMap = {};
    for (const owner of data.results) {
      map[owner.id] = `${owner.firstName} ${owner.lastName}`.trim();
    }
    return map;
  } catch {
    return {};
  }
}

export async function getDealStages(): Promise<StageMap> {
  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/pipelines/deals`, { headers: headers(), cache: "no-store" as RequestCache });
    if (!res.ok) return {};
    const data = await res.json();
    const map: StageMap = {};
    for (const pipeline of data.results) {
      for (const stage of pipeline.stages) {
        map[stage.id] = stage.label;
      }
    }
    return map;
  } catch {
    return {};
  }
}

const COMPANY_PROPERTIES = [
  "name", "domain", "hubspot_owner_id", "notes_last_contacted",
  "understory_total_number_of_transactions",
  "understory_booking_volume_all_time",
  "understory_booking_volume_1m",
  "understory_booking_volume_2m",
  "understory_booking_volume_3m",
  "understory_booking_volume_6m",
  "understory_booking_volume_12m",
  "understory_total_platform_fee_cents_received",
  "health_score", "createdate",
  "understory_health_score_actual_acv",
  "understory_health_score_customer_storefront_visits",
  "understory_health_score_customer_widget_visits",
  "understory_health_score_features_enabled",
  "understory_health_score_login_last_month",
  "understory_health_score_transactions_diff",
  "understory_health_score_upcoming_events",
  "understory_backoffice_latest_visit",
  "understory_storefront_latest_visit",
  "understory_widget_latest_visit",
  "understory_has_started_understory_pay_onboarding",
  "understory_pay_verification_status",
  "understory_pay_live",
  "understory_pay_live_date",
  "understory_pay_unwilling",
  "understory_pay_unwilling_reason",
  "understory_pay_ineligible",
  "understory_pay_ineligible_reason",
];

const DEAL_PROPERTIES = [
  "dealname", "dealstage", "confirmed__contract_mrr",
  "booking_fee", "confirmed_booking_fee", "understory_pay_status__customer", "unpaid_invoice",
  "pipeline", "deal_currency_code", "Storefront link",
  "share_of_transactions_via_understory_pay",
  "enable_understory_pay",
  "wish_to_churn", "churn_reason", "churned_reason_elaborated", "churn_date", "customer_stage",
];

export async function getCompanyDetail(companyId: string): Promise<CompanyDetail> {
  const [companyRes, dealResult, engagementsRes] = await Promise.all([
    fetchCompany(companyId),
    fetchLifecycleDeal(companyId),
    fetchEngagements(companyId),
  ]);

  const tasksRes = await fetchTasks(companyId, dealResult?.dealIds || []);

  return {
    company: companyRes,
    deal: dealResult?.properties || null,
    engagements: engagementsRes,
    tasks: tasksRes,
    recap: null,
  };
}

async function fetchCompany(id: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `${HUBSPOT_API}/crm/v3/objects/companies/${id}?properties=${COMPANY_PROPERTIES.join(",")}`,
      { headers: headers(), cache: "no-store" }
    );
    if (!res.ok) return {};
    const data = await res.json();
    return data.properties || {};
  } catch {
    return {};
  }
}

async function fetchLifecycleDeal(companyId: string): Promise<{ properties: Record<string, string>; dealIds: string[] } | null> {
  try {
    const assocRes = await fetch(
      `${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/deals`,
      { headers: headers(), cache: "no-store" as RequestCache }
    );
    if (!assocRes.ok) return null;
    const assocData = await assocRes.json();
    const dealIds: string[] = assocData.results?.map((r: { id: string }) => r.id) || [];
    if (dealIds.length === 0) return null;

    const batchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/batch/read`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        inputs: dealIds.map((id) => ({ id })),
        properties: DEAL_PROPERTIES,
      }),
    });
    if (!batchRes.ok) return null;
    const batchData = await batchRes.json();

    const pipelineIds = (process.env.HUBSPOT_LIFECYCLE_PIPELINE_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const lifecycleDeal = batchData.results?.find(
      (d: { properties: Record<string, string> }) =>
        pipelineIds.includes(d.properties.pipeline)
    );

    return {
      properties: lifecycleDeal?.properties || {},
      dealIds: dealIds,
    };
  } catch {
    return null;
  }
}

async function fetchEngagements(companyId: string): Promise<Engagement[]> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 365);
  const sinceTimestamp = ninetyDaysAgo.getTime();

  const types = [
    { type: "calls" as const, props: ["hs_call_title", "hs_call_body", "hs_body_preview", "hs_call_direction", "hs_timestamp", "hs_call_status"] },
    { type: "meetings" as const, props: ["hs_meeting_title", "hs_meeting_body", "hs_body_preview", "hs_timestamp", "hs_meeting_outcome"] },
    { type: "notes" as const, props: ["hs_note_body", "hs_timestamp", "hubspot_owner_id"] },
    { type: "emails" as const, props: ["hs_email_subject", "hs_email_body", "hs_email_text", "hs_timestamp", "hs_email_from_email", "hs_email_to_email", "hs_email_direction"] },
  ];

  const results = await Promise.all(
    types.map(async ({ type, props }) => {
      try {
        const assocRes = await fetch(
          `${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/${type}`,
          { headers: headers(), cache: "no-store" as RequestCache }
        );
        if (!assocRes.ok) return [];
        const assocData = await assocRes.json();
        let ids: string[] = assocData.results?.map((r: { id: string }) => r.id) || [];
        if (ids.length === 0) return [];

        // Batch read in chunks of 100 (HubSpot limit per batch)
        const allResults: { properties: Record<string, string> }[] = [];
        for (let i = 0; i < ids.length; i += 100) {
          const chunk = ids.slice(i, i + 100);
          const batchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/${type}/batch/read`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify({
              inputs: chunk.map((id) => ({ id })),
              properties: props,
            }),
          });
          if (batchRes.ok) {
            const batchData = await batchRes.json();
            allResults.push(...(batchData.results || []));
          }
        }

        let engagements = allResults
          .filter((e: { properties: Record<string, string> }) => {
            const tsStr = e.properties.hs_timestamp;
            if (!tsStr) return false;
            const ts = new Date(tsStr).getTime();
            return !isNaN(ts) && ts >= sinceTimestamp;
          })
          .map((e: { properties: Record<string, string> }) => mapEngagement(type, e.properties));

        // For emails: filter out calendar responses, then deduplicate by thread
        if (type === "emails") {
          // Remove calendar responses first
          engagements = engagements.filter((e: { title: string }) => {
            const subject = e.title || "";
            return !["Accepted:", "Tentative:", "Declined:"].some((prefix) => subject.startsWith(prefix));
          });

          // Sort newest first, keep most recent per thread (max 5 threads)
          engagements.sort((a: { timestamp: string }, b: { timestamp: string }) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          const threadMap = new Map<string, typeof engagements[0]>();
          for (const e of engagements) {
            const threadKey = (e.title || "").replace(/^(Re:\s*|Fwd:\s*)+/i, "").trim().toLowerCase();
            if (!threadMap.has(threadKey)) {
              threadMap.set(threadKey, e);
            }
            if (threadMap.size >= 5) break;
          }
          engagements = Array.from(threadMap.values());
        }

        return engagements;
      } catch {
        return [];
      }
    })
  );

  const allEngagements = results.flat();
  // Calendar email filtering already done in the email fetch above

  return allEngagements.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function mapEngagement(type: string, props: Record<string, string>): Engagement {
  switch (type) {
    case "calls":
      return {
        type: "call",
        title: props.hs_call_title || "Call",
        body: props.hs_call_body || "",
        bodyPreview: props.hs_body_preview || "",
        summary: "",
        timestamp: props.hs_timestamp || "",
        direction: props.hs_call_direction,
        status: props.hs_call_status,
      };
    case "meetings":
      return {
        type: "meeting",
        title: props.hs_meeting_title || "Meeting",
        body: props.hs_meeting_body || "",
        bodyPreview: props.hs_body_preview || "",
        summary: "",
        timestamp: props.hs_timestamp || "",
        outcome: props.hs_meeting_outcome,
      };
    case "notes":
      return {
        type: "note",
        title: "Note",
        body: props.hs_note_body || "",
        bodyPreview: (props.hs_note_body || "").slice(0, 200),
        summary: "",
        timestamp: props.hs_timestamp || "",
        owner: props.hubspot_owner_id,
      };
    case "emails":
      const emailBody = props.hs_email_text || props.hs_email_body || "";
      return {
        type: "email",
        title: props.hs_email_subject || "Email",
        body: emailBody,
        bodyPreview: emailBody.replace(/<[^>]*>/g, "").trim().slice(0, 200),
        summary: "",
        timestamp: props.hs_timestamp || "",
        direction: props.hs_email_direction,
        fromEmail: props.hs_email_from_email,
        toEmail: props.hs_email_to_email,
      };
    default:
      return {
        type: "note",
        title: "Unknown",
        body: "",
        bodyPreview: "",
        summary: "",
        timestamp: props.hs_timestamp || "",
      };
  }
}

async function fetchTasks(companyId: string, dealIds: string[] = []): Promise<TaskItem[]> {
  try {
    const assocPromises = [
      fetch(`${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/tasks`, { headers: headers(), cache: "no-store" as RequestCache }),
      ...dealIds.map((dealId) =>
        fetch(`${HUBSPOT_API}/crm/v3/objects/deals/${dealId}/associations/tasks`, { headers: headers(), cache: "no-store" as RequestCache })
      ),
    ];
    const assocResults = await Promise.all(assocPromises);
    const allIds = new Set<string>();
    for (const res of assocResults) {
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of data.results || []) allIds.add(r.id);
    }
    const ids = Array.from(allIds);
    if (ids.length === 0) return [];

    const batchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/tasks/batch/read`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        inputs: ids.map((id) => ({ id })),
        properties: ["hs_task_subject", "hs_task_status", "hs_task_due_date", "hubspot_owner_id"],
      }),
    });
    if (!batchRes.ok) return [];
    const batchData = await batchRes.json();

    const now = new Date();
    return (batchData.results || [])
      .map((t: { properties: Record<string, string> }) => ({
        subject: t.properties.hs_task_subject || "",
        status: t.properties.hs_task_status || "",
        dueDate: t.properties.hs_task_due_date || "",
        owner: t.properties.hubspot_owner_id || "",
      }))
      .filter((t: TaskItem) => {
        const due = new Date(t.dueDate);
        return !isNaN(due.getTime()) && due >= now;
      })
      .sort((a: TaskItem, b: TaskItem) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  } catch {
    return [];
  }
}
