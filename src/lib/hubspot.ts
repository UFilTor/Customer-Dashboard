import { CompanySearchResult, CompanyDetail, Engagement, TaskItem, OwnerMap, StageMap } from "./types";

const HUBSPOT_API = "https://api.hubapi.com";

function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not set");
  return token;
}

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
}

export async function searchCompanies(query: string): Promise<CompanySearchResult[]> {
  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        query: query,
        properties: ["name", "domain"],
        limit: 5,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results.map((r: { id: string; properties: { name: string; domain: string } }) => ({
      id: r.id,
      name: r.properties.name,
      domain: r.properties.domain || "",
    }));
  } catch {
    return [];
  }
}

export async function getOwners(): Promise<OwnerMap> {
  try {
    const res = await fetch(`${HUBSPOT_API}/crm/v3/owners`, { headers: headers() });
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
    const res = await fetch(`${HUBSPOT_API}/crm/v3/pipelines/deals`, { headers: headers() });
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
  "understory_booking_volume_last_12_months",
];

const DEAL_PROPERTIES = [
  "dealname", "dealstage", "confirmed__contract_mrr",
  "booking_fee", "understory_pay_status__customer", "Tags",
  "pipeline",
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
  };
}

async function fetchCompany(id: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `${HUBSPOT_API}/crm/v3/objects/companies/${id}?properties=${COMPANY_PROPERTIES.join(",")}`,
      { headers: headers() }
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
      { headers: headers() }
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

    const lifecyclePipelineId = process.env.HUBSPOT_LIFECYCLE_PIPELINE_ID;
    const lifecycleDeal = batchData.results?.find(
      (d: { properties: Record<string, string> }) =>
        d.properties.pipeline === lifecyclePipelineId
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
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const sinceTimestamp = ninetyDaysAgo.getTime();

  const types = [
    { type: "calls" as const, props: ["hs_call_title", "hs_call_body", "hs_body_preview", "hs_call_direction", "hs_timestamp", "hs_call_status"] },
    { type: "meetings" as const, props: ["hs_meeting_title", "hs_meeting_body", "hs_body_preview", "hs_timestamp", "hs_meeting_outcome"] },
    { type: "notes" as const, props: ["hs_note_body", "hs_timestamp", "hubspot_owner_id"] },
    { type: "emails" as const, props: ["hs_email_subject", "hs_email_body", "hs_timestamp", "hs_email_from_email", "hs_email_to_email", "hs_email_direction"] },
  ];

  const results = await Promise.all(
    types.map(async ({ type, props }) => {
      try {
        const assocRes = await fetch(
          `${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/${type}`,
          { headers: headers() }
        );
        if (!assocRes.ok) return [];
        const assocData = await assocRes.json();
        const ids: string[] = assocData.results?.map((r: { id: string }) => r.id) || [];
        if (ids.length === 0) return [];

        const batchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/${type}/batch/read`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            inputs: ids.map((id) => ({ id })),
            properties: props,
          }),
        });
        if (!batchRes.ok) return [];
        const batchData = await batchRes.json();

        return (batchData.results || [])
          .filter((e: { properties: Record<string, string> }) => {
            const ts = parseInt(e.properties.hs_timestamp);
            return !isNaN(ts) && ts >= sinceTimestamp;
          })
          .map((e: { properties: Record<string, string> }) => mapEngagement(type, e.properties));
      } catch {
        return [];
      }
    })
  );

  const allEngagements = results.flat();
  const filtered = allEngagements.filter((e) => {
    if (e.type !== "email") return true;
    const subject = e.title || "";
    return !["Accepted:", "Tentative:", "Declined:"].some((prefix) => subject.startsWith(prefix));
  });

  return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function mapEngagement(type: string, props: Record<string, string>): Engagement {
  switch (type) {
    case "calls":
      return {
        type: "call",
        title: props.hs_call_title || "Call",
        body: props.hs_call_body || "",
        bodyPreview: props.hs_body_preview || "",
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
        timestamp: props.hs_timestamp || "",
        outcome: props.hs_meeting_outcome,
      };
    case "notes":
      return {
        type: "note",
        title: "Note",
        body: props.hs_note_body || "",
        bodyPreview: (props.hs_note_body || "").slice(0, 200),
        timestamp: props.hs_timestamp || "",
        owner: props.hubspot_owner_id,
      };
    case "emails":
      return {
        type: "email",
        title: props.hs_email_subject || "Email",
        body: props.hs_email_body || "",
        bodyPreview: (props.hs_email_body || "").slice(0, 200),
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
        timestamp: props.hs_timestamp || "",
      };
  }
}

async function fetchTasks(companyId: string, dealIds: string[] = []): Promise<TaskItem[]> {
  try {
    const assocPromises = [
      fetch(`${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/tasks`, { headers: headers() }),
      ...dealIds.map((dealId) =>
        fetch(`${HUBSPOT_API}/crm/v3/objects/deals/${dealId}/associations/tasks`, { headers: headers() })
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
