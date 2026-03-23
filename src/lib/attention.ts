import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { AttentionCompany } from "./types";

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
        properties: ["dealname"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const deals: { id: string; dealname: string }[] = data.results?.map(
      (d: { id: string; properties: { dealname: string } }) => ({
        id: d.id,
        dealname: d.properties.dealname || "Unknown deal",
      })
    ) || [];

    if (deals.length === 0) return [];

    const companyMap = new Map<string, { name: string; detail: string; ownerId?: string }>();

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
        companyMap.set(companyId, { name: "", detail: deal.dealname });
      } catch {
        continue;
      }
    }

    if (companyMap.size === 0) return [];

    const companyIds = Array.from(companyMap.keys());
    const batchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/batch/read`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        inputs: companyIds.map((id) => ({ id })),
        properties: ["name", "hubspot_owner_id"],
      }),
    });
    if (!batchRes.ok) return [];
    const batchData = await batchRes.json();

    for (const company of batchData.results || []) {
      const entry = companyMap.get(company.id);
      if (entry) {
        entry.name = company.properties.name || "Unknown";
        entry.ownerId = company.properties.hubspot_owner_id || "";
      }
    }

    return companyIds
      .map((id) => ({ id, ...companyMap.get(id)! }))
      .filter((c) => c.name);
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
    const tasks: { id: string; subject: string; dueDate: string }[] = data.results?.map(
      (t: { id: string; properties: { hs_task_subject: string; hs_task_due_date: string } }) => ({
        id: t.id,
        subject: t.properties.hs_task_subject || "Untitled task",
        dueDate: t.properties.hs_task_due_date || "",
      })
    ) || [];

    if (tasks.length === 0) return [];

    const companyMap = new Map<string, { name: string; detail: string; ownerId?: string }>();

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

        const daysOverdue = Math.floor(
          (Date.now() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        const existing = companyMap.get(companyId);
        if (!existing || daysOverdue > parseInt(existing.detail)) {
          companyMap.set(companyId, {
            name: "",
            detail: `${task.subject} (${daysOverdue}d overdue)`,
          });
        }
      } catch {
        continue;
      }
    }

    if (companyMap.size === 0) return [];

    const companyIds = Array.from(companyMap.keys());
    const batchRes = await fetch(`${HUBSPOT_API}/crm/v3/objects/companies/batch/read`, {
      method: "POST",
      headers: hubspotHeaders(),
      body: JSON.stringify({
        inputs: companyIds.map((id) => ({ id })),
        properties: ["name", "hubspot_owner_id"],
      }),
    });
    if (!batchRes.ok) return [];
    const batchData = await batchRes.json();

    for (const company of batchData.results || []) {
      const entry = companyMap.get(company.id);
      if (entry) {
        entry.name = company.properties.name || "Unknown";
        entry.ownerId = company.properties.hubspot_owner_id || "";
      }
    }

    return companyIds
      .map((id) => ({ id, ...companyMap.get(id)! }))
      .filter((c) => c.name);
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

    return (data.results || []).map(
      (c: { id: string; properties: Record<string, string> }) => ({
        id: c.id,
        name: c.properties.name || "Unknown",
        detail: c.properties["Health Score Category"] || "Unknown",
        ownerId: c.properties.hubspot_owner_id || "",
      })
    );
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

    return (data.results || []).map(
      (c: { id: string; properties: Record<string, string> }) => {
        const lastDate = new Date(c.properties.notes_last_contacted);
        const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: c.id,
          name: c.properties.name || "Unknown",
          detail: `Last contacted ${daysAgo} days ago`,
          ownerId: c.properties.hubspot_owner_id || "",
        };
      }
    );
  } catch {
    return [];
  }
}
