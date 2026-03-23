# Needs Attention Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard empty state with a proactive attention list that surfaces customers needing action, grouped by urgency signal.

**Architecture:** New `/api/attention` route runs 4 HubSpot queries in parallel (overdue invoices, overdue tasks, health score issues, gone quiet), returns grouped results with 15-min server cache. UI renders groups with expand/collapse, clicking a company loads the detail view.

**Tech Stack:** Next.js API routes, HubSpot REST API v3, existing Cache class, Tailwind with Understory brand tokens

**Spec:** `docs/superpowers/specs/2026-03-23-needs-attention-design.md`

---

## File Structure

```
src/
  lib/
    types.ts              # Modify: add AttentionCompany, AttentionGroup, AttentionResponse
    hubspot-api.ts        # Create: shared HubSpot API helpers (extract from hubspot.ts)
    hubspot.ts            # Modify: import helpers from hubspot-api.ts instead of defining locally
    attention.ts          # Create: 4 signal query functions
  app/
    api/attention/
      route.ts            # Create: GET /api/attention with 15-min cache
    page.tsx              # Modify: replace empty state with AttentionList
    preview/page.tsx      # Modify: add mock attention data
  components/
    AttentionList.tsx      # Create: full attention dashboard container
    AttentionGroup.tsx     # Create: individual group with expand/collapse
    # Skeleton is inlined in AttentionList.tsx (no separate component needed)
```

---

## Task 1: Add Types and Extract Shared HubSpot Helpers

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/hubspot-api.ts`
- Modify: `src/lib/hubspot.ts`

- [ ] **Step 1: Add attention types to types.ts**

Add after the `Recap` interface in `src/lib/types.ts`:

```ts
export interface AttentionCompany {
  id: string;
  name: string;
  detail: string;
}

export type AttentionSignal = "overdue_invoices" | "overdue_tasks" | "health_score" | "gone_quiet";

export interface AttentionGroup {
  signal: AttentionSignal;
  label: string;
  companies: AttentionCompany[];
}

export interface AttentionResponse {
  groups: AttentionGroup[];
  updatedAt: string;
}
```

- [ ] **Step 2: Create shared HubSpot API helpers**

Create `src/lib/hubspot-api.ts`:

```ts
export const HUBSPOT_API = "https://api.hubapi.com";

export function getToken(): string {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN is not set");
  return token;
}

export function hubspotHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getToken()}`,
    "Content-Type": "application/json",
  };
}
```

- [ ] **Step 3: Update hubspot.ts to use shared helpers**

In `src/lib/hubspot.ts`, replace the local `HUBSPOT_API`, `getToken()`, and `headers()` with imports:

```ts
import { HUBSPOT_API, hubspotHeaders as headers } from "./hubspot-api";
```

Remove the local `HUBSPOT_API` const, `getToken()` function, and `headers()` function (lines 3-16).

- [ ] **Step 4: Run all tests to verify no breakage**

Run: `npx vitest run`
Expected: All 28 tests pass (the refactor is transparent to consumers)

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/hubspot-api.ts src/lib/hubspot.ts
git commit -m "feat: add attention types and extract shared HubSpot API helpers"
```

---

## Task 2: Implement Attention Signal Queries

**Files:**
- Create: `src/lib/attention.ts`
- Create: `src/__tests__/lib/attention.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/lib/attention.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
  process.env.HUBSPOT_LIFECYCLE_PIPELINE_ID = "pipeline-123";
});

import { fetchOverdueInvoices, fetchOverdueTasks, fetchHealthScoreIssues, fetchGoneQuiet } from "@/lib/attention";

describe("fetchOverdueInvoices", () => {
  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchOverdueInvoices();
    expect(result).toEqual([]);
  });

  it("returns empty array when no deals match", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const result = await fetchOverdueInvoices();
    expect(result).toEqual([]);
  });
});

describe("fetchOverdueTasks", () => {
  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchOverdueTasks();
    expect(result).toEqual([]);
  });

  it("returns empty array when no tasks match", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });
    const result = await fetchOverdueTasks();
    expect(result).toEqual([]);
  });
});

describe("fetchHealthScoreIssues", () => {
  it("returns companies with At Risk or Critical Churn Risk scores", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: "c1", properties: { name: "Acme Co", "Health Score Category": "At Risk" } },
          { id: "c2", properties: { name: "Beta Inc", "Health Score Category": "Critical Churn Risk" } },
        ],
      }),
    });

    const result = await fetchHealthScoreIssues();
    expect(result).toEqual([
      { id: "c1", name: "Acme Co", detail: "At Risk" },
      { id: "c2", name: "Beta Inc", detail: "Critical Churn Risk" },
    ]);
  });

  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });
    const result = await fetchHealthScoreIssues();
    expect(result).toEqual([]);
  });
});

describe("fetchGoneQuiet", () => {
  it("returns companies not contacted in 45+ days with days count", async () => {
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: "c3", properties: { name: "Gamma Ltd", notes_last_contacted: sixtyDaysAgo.toISOString() } },
        ],
      }),
    });

    const result = await fetchGoneQuiet();
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("c3");
    expect(result[0].name).toBe("Gamma Ltd");
    expect(result[0].detail).toContain("days ago");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/attention.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement attention.ts**

Create `src/lib/attention.ts`:

```ts
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

    const companyMap = new Map<string, { name: string; detail: string }>();

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
        properties: ["name"],
      }),
    });
    if (!batchRes.ok) return [];
    const batchData = await batchRes.json();

    for (const company of batchData.results || []) {
      const entry = companyMap.get(company.id);
      if (entry) entry.name = company.properties.name || "Unknown";
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

    const companyMap = new Map<string, { name: string; detail: string }>();

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
        properties: ["name"],
      }),
    });
    if (!batchRes.ok) return [];
    const batchData = await batchRes.json();

    for (const company of batchData.results || []) {
      const entry = companyMap.get(company.id);
      if (entry) entry.name = company.properties.name || "Unknown";
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
        properties: ["name", "Health Score Category"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).map(
      (c: { id: string; properties: { name: string; "Health Score Category": string } }) => ({
        id: c.id,
        name: c.properties.name || "Unknown",
        detail: c.properties["Health Score Category"] || "Unknown",
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
        properties: ["name", "notes_last_contacted"],
        limit: 100,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || []).map(
      (c: { id: string; properties: { name: string; notes_last_contacted: string } }) => {
        const lastDate = new Date(c.properties.notes_last_contacted);
        const daysAgo = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: c.id,
          name: c.properties.name || "Unknown",
          detail: `Last contacted ${daysAgo} days ago`,
        };
      }
    );
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/attention.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/attention.ts src/__tests__/lib/attention.test.ts
git commit -m "feat: add attention signal query functions for HubSpot"
```

---

## Task 3: Create API Route

**Files:**
- Create: `src/app/api/attention/route.ts`

- [ ] **Step 1: Create the attention API route**

Create `src/app/api/attention/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { fetchOverdueInvoices, fetchOverdueTasks, fetchHealthScoreIssues, fetchGoneQuiet } from "@/lib/attention";
import { Cache } from "@/lib/cache";
import { AttentionResponse } from "@/lib/types";

const attentionCache = new Cache<AttentionResponse>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  if (!refresh) {
    const cached = attentionCache.get("attention");
    if (cached) return NextResponse.json(cached);
  }

  try {
    const [overdueInvoices, overdueTasks, healthScore, goneQuiet] = await Promise.all([
      fetchOverdueInvoices(),
      fetchOverdueTasks(),
      fetchHealthScoreIssues(),
      fetchGoneQuiet(),
    ]);

    const response: AttentionResponse = {
      groups: [
        { signal: "overdue_invoices", label: "Overdue Invoices", companies: overdueInvoices },
        { signal: "overdue_tasks", label: "Overdue Tasks", companies: overdueTasks },
        { signal: "health_score", label: "Health Score Issues", companies: healthScore },
        { signal: "gone_quiet", label: "Gone Quiet", companies: goneQuiet },
      ].filter((g) => g.companies.length > 0),
      updatedAt: new Date().toISOString(),
    };

    attentionCache.set("attention", response);
    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Could not load attention data" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/app/api/attention/route.ts
git commit -m "feat: add /api/attention route with 15-min cache"
```

---

## Task 4: Create AttentionGroup Component

**Files:**
- Create: `src/components/AttentionGroup.tsx`

- [ ] **Step 1: Create AttentionGroup**

Create `src/components/AttentionGroup.tsx`:

```tsx
"use client";

import { useState } from "react";
import { AttentionGroup as AttentionGroupType, AttentionSignal, CompanySearchResult } from "@/lib/types";

interface Props {
  group: AttentionGroupType;
  onSelectCompany: (company: CompanySearchResult) => void;
}

const URGENT_SIGNALS: AttentionSignal[] = ["overdue_invoices", "overdue_tasks"];

export function AttentionGroup({ group, onSelectCompany }: Props) {
  const [expanded, setExpanded] = useState(false);
  const isUrgent = URGENT_SIGNALS.includes(group.signal);
  const displayCount = expanded ? group.companies.length : 5;
  const hasMore = group.companies.length > 5;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-semibold text-[var(--moss)]">{group.label}</h3>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isUrgent
              ? "bg-[var(--rust)] text-white"
              : "bg-[var(--beige)] text-[var(--moss)]"
          }`}
        >
          {group.companies.length}
        </span>
      </div>

      <div className="space-y-2">
        {group.companies.slice(0, displayCount).map((company) => (
          <button
            key={company.id}
            onClick={() => onSelectCompany({ id: company.id, name: company.name, domain: "" })}
            className="w-full bg-[var(--light-grey)] rounded-[var(--border-radius)] p-3 flex items-center justify-between text-left hover:bg-[var(--lichen)]/30 transition-all duration-200"
          >
            <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
            <span className="text-xs text-[var(--green-100)]">{company.detail}</span>
          </button>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-[var(--moss)] font-semibold mt-2 hover:underline transition-all duration-200"
        >
          {expanded ? "Show less" : `Show all (${group.companies.length})`}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/components/AttentionGroup.tsx
git commit -m "feat: add AttentionGroup component with expand/collapse"
```

---

## Task 5: Create AttentionList Component and Skeleton

**Files:**
- Create: `src/components/AttentionList.tsx`
- Modify: `src/components/Skeleton.tsx`

- [ ] **Step 1: Create AttentionList**

Create `src/components/AttentionList.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { AttentionGroup as AttentionGroupComponent } from "./AttentionGroup";
import { AttentionResponse, CompanySearchResult } from "@/lib/types";

interface Props {
  onSelectCompany: (company: CompanySearchResult) => void;
}

export function AttentionList({ onSelectCompany }: Props) {
  const [data, setData] = useState<AttentionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAttention(refresh = false) {
    setIsLoading(true);
    setError(null);
    try {
      const url = refresh ? "/api/attention?refresh=true" : "/api/attention";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Could not load attention data. Try refreshing.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchAttention();
  }, []);

  function formatUpdatedAt(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Updated just now";
    if (minutes === 1) return "Updated 1 minute ago";
    return `Updated ${minutes} minutes ago`;
  }

  if (isLoading) {
    return <SkeletonAttentionInline />;
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--rust)] text-sm mb-2">{error}</p>
        <button
          onClick={() => fetchAttention(true)}
          className="text-sm text-[var(--moss)] font-semibold hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data || data.groups.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--moss)] text-lg font-medium">All clear</p>
        <p className="text-[var(--green-100)] text-sm mt-1">No customers need immediate attention.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-[var(--moss)]">Needs Attention</h2>
          <p className="text-xs text-[var(--green-100)] mt-1">
            {formatUpdatedAt(data.updatedAt)}
          </p>
        </div>
        <button
          onClick={() => fetchAttention(true)}
          className="text-sm text-[var(--moss)] hover:text-[var(--green-100)] transition-all duration-200"
          title="Refresh"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
      </div>

      {data.groups.map((group) => (
        <AttentionGroupComponent
          key={group.signal}
          group={group}
          onSelectCompany={onSelectCompany}
        />
      ))}
    </div>
  );
}

function SkeletonAttentionInline() {
  return (
    <div className="animate-pulse">
      <div className="h-6 w-40 bg-[var(--beige-gray)] rounded mb-2" />
      <div className="h-3 w-32 bg-[var(--beige-gray)] rounded mb-6" />
      {[1, 2, 3].map((i) => (
        <div key={i} className="mb-6">
          <div className="h-5 w-36 bg-[var(--beige-gray)] rounded mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-12 bg-[var(--light-grey)] rounded-[var(--border-radius)]" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/components/AttentionList.tsx
git commit -m "feat: add AttentionList component with loading, error, and empty states"
```

---

## Task 6: Wire Into Main Page and Preview

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/preview/page.tsx`

- [ ] **Step 1: Update page.tsx to show AttentionList**

In `src/app/page.tsx`:

1. Add import at top:
```tsx
import { AttentionList } from "@/components/AttentionList";
```

2. Replace the empty state block (lines 65-69):
```tsx
          {!companyData && !isLoading && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <p className="text-[var(--green-100)] text-lg">Search for a company to get started</p>
            </div>
          )}
```

With:
```tsx
          {!companyData && !isLoading && (
            <AttentionList onSelectCompany={handleSelect} />
          )}
```

- [ ] **Step 2: Update preview page with mock attention data**

In `src/app/preview/page.tsx`:

1. Add import for the type (AttentionList is NOT used in preview - mock data is rendered inline):
```tsx
import { AttentionResponse } from "@/lib/types";
```

2. Add mock attention data as a constant (after MOCK_DATA):
```tsx
const MOCK_ATTENTION: AttentionResponse = {
  groups: [
    {
      signal: "overdue_invoices",
      label: "Overdue Invoices",
      companies: [
        { id: "101", name: "Nordic Kayak Tours", detail: "Nordic Kayak - Pro" },
        { id: "102", name: "Copenhagen Food Walks", detail: "Food Walks - Starter" },
      ],
    },
    {
      signal: "overdue_tasks",
      label: "Overdue Tasks",
      companies: [
        { id: "103", name: "Stockholm Adventures", detail: "Send onboarding materials (5d overdue)" },
        { id: "104", name: "Malmo Workshops", detail: "Schedule Q1 review (12d overdue)" },
        { id: "105", name: "Gothenburg Experiences", detail: "Follow up on payment setup (3d overdue)" },
      ],
    },
    {
      signal: "health_score",
      label: "Health Score Issues",
      companies: [
        { id: "106", name: "Bergen Outdoor Co", detail: "Critical Churn Risk" },
        { id: "107", name: "Helsinki Tasting Club", detail: "At Risk" },
      ],
    },
    {
      signal: "gone_quiet",
      label: "Gone Quiet",
      companies: [
        { id: "108", name: "Oslo Creative Labs", detail: "Last contacted 62 days ago" },
        { id: "109", name: "Aarhus Adventure Park", detail: "Last contacted 51 days ago" },
        { id: "110", name: "Tampere Escape Rooms", detail: "Last contacted 48 days ago" },
      ],
    },
  ],
  updatedAt: new Date().toISOString(),
};
```

3. Replace the preview empty state (the "Search for a company..." + button section) with a mock attention list. Since AttentionList fetches from the API, create a simple static mock version inline:

```tsx
        {!showData && !showLoading && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-[var(--moss)]">Needs Attention</h2>
                <p className="text-xs text-[var(--green-100)] mt-1">Preview with mock data</p>
              </div>
              <button
                onClick={handleLoadMock}
                className="bg-[var(--citrus)] text-[var(--moss)] px-4 py-2 rounded-[8px] text-sm font-semibold hover:bg-[var(--lichen)] transition-all duration-200"
              >
                Load company detail
              </button>
            </div>
            {MOCK_ATTENTION.groups.map((group) => (
              <div key={group.signal} className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-semibold text-[var(--moss)]">{group.label}</h3>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    group.signal === "overdue_invoices" || group.signal === "overdue_tasks"
                      ? "bg-[var(--rust)] text-white"
                      : "bg-[var(--beige)] text-[var(--moss)]"
                  }`}>
                    {group.companies.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.companies.map((company) => (
                    <button
                      key={company.id}
                      onClick={handleLoadMock}
                      className="w-full bg-[var(--light-grey)] rounded-[var(--border-radius)] p-3 flex items-center justify-between text-left hover:bg-[var(--lichen)]/30 transition-all duration-200"
                    >
                      <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
                      <span className="text-xs text-[var(--green-100)]">{company.detail}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/preview/page.tsx
git commit -m "feat: replace empty state with attention list, add mock data to preview"
```

---

## Task 7: Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Verify preview**

Navigate to `http://localhost:3001/preview`.
Verify:
- Attention list shows on the default view with 4 groups
- Each group has a count badge (rust for invoices/tasks, beige for others)
- Company rows are clickable and load the mock company detail
- "Load company detail" button works
- All other features still work (metric cards, recap, tabs, activity, tasks)
