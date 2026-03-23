# Customer Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an internal customer lookup dashboard that searches HubSpot companies and displays key metrics, deal info, activity, and tasks.

**Architecture:** Next.js App Router with server-side API routes calling HubSpot REST API v3 via a shared bearer token. HubSpot OAuth for user login via NextAuth.js. In-memory cache (5-min TTL) per company to stay within rate limits.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, NextAuth.js, Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-customer-dashboard-design.md`

**Brand:** Use `understory-brand` skill for all UI work. Primary: `#022C12`, Accent: `#F1F97E`, Background: `#FFFFFF`, Text: `#4D4D4D`, Font: Inter, Border radius: 16px general / 8px buttons.

---

## File Structure

```
src/
  app/
    layout.tsx                    # Root layout with Inter font, global styles
    page.tsx                      # Main dashboard page (search + company view)
    api/
      auth/[...nextauth]/route.ts # NextAuth HubSpot OAuth handler
      companies/search/route.ts   # GET - search companies by name
      companies/[id]/route.ts     # GET - full company detail (company + deal + engagements + tasks)
  components/
    SearchBar.tsx                 # Autocomplete search input with dropdown
    MetricCards.tsx               # 4 green metric cards row
    CompanyHeader.tsx             # Company name, subtitle, HubSpot link
    TabContainer.tsx              # Tab navigation (Overview, Activity, Tasks)
    OverviewTab.tsx               # Two-column: company info + deal info
    ActivityTab.tsx               # Chronological engagement feed
    TasksTab.tsx                  # Open tasks list
    FieldRenderer.tsx             # Renders a value based on format type (currency, date, badge, etc.)
    Skeleton.tsx                  # Skeleton loader components
  config/
    hubspot-fields.ts             # Dashboard field configuration (the editable config)
  lib/
    hubspot.ts                    # HubSpot API client (bearer token, typed methods)
    cache.ts                      # In-memory cache with TTL
    format.ts                     # Value formatters (currency, date, percentage, owner, invoiceStatus)
    types.ts                      # Shared TypeScript types
  __tests__/
    lib/
      cache.test.ts
      format.test.ts
      hubspot.test.ts
    components/
      FieldRenderer.test.tsx
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `.env.local.example`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize Next.js project**

Run: `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm`

Accept defaults. This creates the full scaffolding.

- [ ] **Step 2: Install test dependencies**

Run: `npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom`

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: [],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 4: Create env example file**

Create `.env.local.example`:

```
HUBSPOT_ACCESS_TOKEN=your_private_app_token
HUBSPOT_CLIENT_ID=your_oauth_client_id
HUBSPOT_CLIENT_SECRET=your_oauth_client_secret
HUBSPOT_PORTAL_ID=your_portal_id
HUBSPOT_LIFECYCLE_PIPELINE_ID=your_lifecycle_pipeline_id
NEXT_PUBLIC_HUBSPOT_PORTAL_ID=your_portal_id
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
```

- [ ] **Step 5: Add Inter font to layout**

Replace `src/app/layout.tsx` with root layout that loads Inter from Google Fonts and sets Understory brand colors as CSS variables.

- [ ] **Step 6: Verify dev server starts**

Run: `npm run dev`
Expected: Next.js dev server starts on localhost:3000

- [ ] **Step 7: Verify tests run**

Run: `npx vitest run`
Expected: No tests found (clean run, no errors)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind, Vitest, and Understory brand"
```

---

## Task 2: Types and Field Configuration

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/config/hubspot-fields.ts`

- [ ] **Step 1: Create shared types**

Create `src/lib/types.ts`:

```ts
export type FormatType =
  | "text"
  | "currency"
  | "number"
  | "date"
  | "link"
  | "percentage"
  | "badge"
  | "owner"
  | "invoiceStatus";

export interface FieldConfig {
  label: string;
  property: string;
  format: FormatType;
}

export interface MetricCardConfig extends FieldConfig {
  source: "company" | "deal";
}

export interface DashboardConfig {
  metricCards: MetricCardConfig[];
  tabs: {
    overview: {
      companyInfo: FieldConfig[];
      dealInfo: FieldConfig[];
    };
    activity: {
      types: string[];
      daysBack: number;
      emailSubjectFilter: string[];
    };
    tasks: {
      filter: string;
      fields: FieldConfig[];
    };
  };
}

export interface CompanySearchResult {
  id: string;
  name: string;
  domain: string;
}

export interface CompanyDetail {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  engagements: Engagement[];
  tasks: TaskItem[];
}

export interface Engagement {
  type: "call" | "meeting" | "note" | "email";
  title: string;
  body: string;
  bodyPreview: string;
  timestamp: string;
  direction?: string;
  status?: string;
  outcome?: string;
  owner?: string;
  fromEmail?: string;
  toEmail?: string;
}

export interface TaskItem {
  subject: string;
  status: string;
  dueDate: string;
  owner: string;
}

export interface OwnerMap {
  [id: string]: string;
}

export interface StageMap {
  [id: string]: string;
}
```

- [ ] **Step 2: Create field configuration**

Create `src/config/hubspot-fields.ts` with the exact config from the spec:

```ts
import { DashboardConfig } from "@/lib/types";

export const dashboardConfig: DashboardConfig = {
  metricCards: [
    { label: "MRR", property: "confirmed__contract_mrr", source: "deal", format: "currency" },
    { label: "Last 12M Volume", property: "understory_booking_volume_last_12_months", source: "company", format: "currency" },
    { label: "Understory Pay", property: "understory_pay_status__customer", source: "deal", format: "text" },
    { label: "Invoice", property: "Tags", source: "deal", format: "invoiceStatus" },
  ],
  tabs: {
    overview: {
      companyInfo: [
        { label: "Domain", property: "domain", format: "link" },
        { label: "Owner", property: "hubspot_owner_id", format: "owner" },
        { label: "Last contacted", property: "notes_last_contacted", format: "date" },
        { label: "Transactions", property: "understory_total_number_of_transactions", format: "number" },
        { label: "All-time volume", property: "understory_booking_volume_all_time", format: "currency" },
      ],
      dealInfo: [
        { label: "Deal name", property: "dealname", format: "text" },
        { label: "Stage", property: "dealstage", format: "badge" },
        { label: "MRR", property: "confirmed__contract_mrr", format: "currency" },
        { label: "Booking fee", property: "booking_fee", format: "percentage" },
        { label: "Understory Pay", property: "understory_pay_status__customer", format: "text" },
        { label: "Invoice status", property: "Tags", format: "invoiceStatus" },
      ],
    },
    activity: {
      types: ["calls", "meetings", "notes", "emails"],
      daysBack: 90,
      emailSubjectFilter: ["Accepted:", "Tentative:", "Declined:"],
    },
    tasks: {
      filter: "future_due_dates",
      fields: [
        { label: "Subject", property: "hs_task_subject", format: "text" },
        { label: "Status", property: "hs_task_status", format: "badge" },
        { label: "Due date", property: "hs_task_due_date", format: "date" },
        { label: "Owner", property: "hubspot_owner_id", format: "owner" },
      ],
    },
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts src/config/hubspot-fields.ts
git commit -m "feat: add TypeScript types and HubSpot field configuration"
```

---

## Task 3: Cache and Format Utilities

**Files:**
- Create: `src/lib/cache.ts`
- Create: `src/lib/format.ts`
- Create: `src/__tests__/lib/cache.test.ts`
- Create: `src/__tests__/lib/format.test.ts`

- [ ] **Step 1: Write failing cache tests**

Create `src/__tests__/lib/cache.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Cache } from "@/lib/cache";

describe("Cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns cached value within TTL", () => {
    const cache = new Cache<string>(5 * 60 * 1000);
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns null after TTL expires", () => {
    const cache = new Cache<string>(5 * 60 * 1000);
    cache.set("key1", "value1");
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(cache.get("key1")).toBeNull();
  });

  it("returns null for missing keys", () => {
    const cache = new Cache<string>(5 * 60 * 1000);
    expect(cache.get("missing")).toBeNull();
  });

  it("supports different TTLs", () => {
    const cache = new Cache<string>(1000);
    cache.set("key1", "value1");
    vi.advanceTimersByTime(1500);
    expect(cache.get("key1")).toBeNull();
  });
});
```

- [ ] **Step 2: Run cache tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/cache.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement cache**

Create `src/lib/cache.ts`:

```ts
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class Cache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private ttl: number;

  constructor(ttlMs: number) {
    this.ttl = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttl) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: T): void {
    this.store.set(key, { data, timestamp: Date.now() });
  }
}
```

- [ ] **Step 4: Run cache tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/cache.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Write failing format tests**

Create `src/__tests__/lib/format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatValue } from "@/lib/format";

describe("formatValue", () => {
  it("formats currency values", () => {
    expect(formatValue("2400", "currency")).toBe("2 400 kr");
  });

  it("formats null/undefined as dash", () => {
    expect(formatValue(null, "currency")).toBe("-");
    expect(formatValue(undefined, "text")).toBe("-");
    expect(formatValue("", "number")).toBe("-");
  });

  it("formats numbers with space separators", () => {
    expect(formatValue("186000", "number")).toBe("186 000");
  });

  it("formats percentages", () => {
    expect(formatValue("3.5", "percentage")).toBe("3.5%");
  });

  it("formats dates as YYYY-MM-DD", () => {
    expect(formatValue("2026-03-21T10:00:00Z", "date")).toBe("2026-03-21");
  });

  it("returns text as-is", () => {
    expect(formatValue("Active", "text")).toBe("Active");
  });

  it("returns link as-is", () => {
    expect(formatValue("example.com", "link")).toBe("example.com");
  });

  it("returns badge as-is", () => {
    expect(formatValue("Active Customer", "badge")).toBe("Active Customer");
  });

  it("returns owner as-is (resolved elsewhere)", () => {
    expect(formatValue("Filip K.", "owner")).toBe("Filip K.");
  });

  it("returns invoiceStatus as-is (styling handled in component)", () => {
    expect(formatValue("Overdue", "invoiceStatus")).toBe("Overdue");
  });
});
```

- [ ] **Step 6: Run format tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/format.test.ts`
Expected: FAIL - module not found

- [ ] **Step 7: Implement formatValue**

Create `src/lib/format.ts`:

```ts
import { FormatType } from "./types";

function formatNumber(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function formatValue(
  value: string | null | undefined,
  format: FormatType
): string {
  if (value === null || value === undefined || value === "") return "-";

  switch (format) {
    case "currency":
      return `${formatNumber(value)} kr`;
    case "number":
      return formatNumber(value);
    case "percentage":
      return `${value}%`;
    case "date": {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      return date.toISOString().split("T")[0];
    }
    case "text":
    case "link":
    case "badge":
    case "owner":
    case "invoiceStatus":
      return value;
    default:
      return value;
  }
}
```

- [ ] **Step 8: Run format tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/format.test.ts`
Expected: All 10 tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/cache.ts src/lib/format.ts src/__tests__/lib/cache.test.ts src/__tests__/lib/format.test.ts
git commit -m "feat: add in-memory cache and value format utilities with tests"
```

---

## Task 4: HubSpot API Client

**Files:**
- Create: `src/lib/hubspot.ts`
- Create: `src/__tests__/lib/hubspot.test.ts`

- [ ] **Step 1: Write failing HubSpot client tests**

Create `src/__tests__/lib/hubspot.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchCompanies, getCompanyDetail, getOwners, getDealStages } from "@/lib/hubspot";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.resetAllMocks();
  process.env.HUBSPOT_ACCESS_TOKEN = "test-token";
});

describe("searchCompanies", () => {
  it("calls HubSpot search API with company name filter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: "123", properties: { name: "Acme Adventures", domain: "acme.se" } },
        ],
      }),
    });

    const results = await searchCompanies("Acme");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.hubapi.com/crm/v3/objects/companies/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
    expect(results).toEqual([
      { id: "123", name: "Acme Adventures", domain: "acme.se" },
    ]);
  });

  it("returns empty array on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const results = await searchCompanies("Acme");
    expect(results).toEqual([]);
  });
});

describe("getOwners", () => {
  it("returns owner id-to-name map", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { id: "1", firstName: "Filip", lastName: "K." },
          { id: "2", firstName: "Anna", lastName: "S." },
        ],
      }),
    });

    const owners = await getOwners();
    expect(owners).toEqual({ "1": "Filip K.", "2": "Anna S." });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/hubspot.test.ts`
Expected: FAIL - module not found

- [ ] **Step 3: Implement HubSpot client**

Create `src/lib/hubspot.ts`:

```ts
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
  // Fetch company, deal, and engagements in parallel. Tasks need deal IDs, so fetch after.
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
    // Get associated deals
    const assocRes = await fetch(
      `${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/deals`,
      { headers: headers() }
    );
    if (!assocRes.ok) return null;
    const assocData = await assocRes.json();
    const dealIds: string[] = assocData.results?.map((r: { id: string }) => r.id) || [];
    if (dealIds.length === 0) return null;

    // Batch fetch deals with properties
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

    // Filter to lifecycle pipeline by ID from env
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
  // Filter out calendar response emails
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
    // Fetch tasks associated with the company and its deals
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/hubspot.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hubspot.ts src/__tests__/lib/hubspot.test.ts
git commit -m "feat: add HubSpot API client with search, company detail, owners, and stages"
```

---

## Task 5: Authentication (NextAuth + HubSpot OAuth)

**Files:**
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Modify: `src/app/layout.tsx` (wrap with SessionProvider)
- Create: `src/components/AuthGate.tsx`

- [ ] **Step 1: Install NextAuth**

Run: `npm install next-auth`

- [ ] **Step 2: Create NextAuth route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";

export const authOptions: NextAuthOptions = {
  providers: [
    {
      id: "hubspot",
      name: "HubSpot",
      type: "oauth",
      authorization: {
        url: "https://app.hubspot.com/oauth/authorize",
        params: { scope: "oauth" },
      },
      token: "https://api.hubapi.com/oauth/v1/token",
      userinfo: {
        url: "https://api.hubapi.com/oauth/v1/access-tokens/",
        async request({ tokens }) {
          const res = await fetch(
            `https://api.hubapi.com/oauth/v1/access-tokens/${tokens.access_token}`
          );
          const data = await res.json();
          return {
            id: data.user_id,
            name: data.user,
            email: data.user,
          };
        },
      },
      clientId: process.env.HUBSPOT_CLIENT_ID,
      clientSecret: process.env.HUBSPOT_CLIENT_SECRET,
      profile(profile) {
        return {
          id: profile.id?.toString(),
          name: profile.name,
          email: profile.email,
        };
      },
    },
  ],
  pages: {
    signIn: "/auth/signin",
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

- [ ] **Step 3: Create sign-in page**

Create `src/app/auth/signin/page.tsx`:

```tsx
"use client";

import { signIn } from "next-auth/react";

export default function SignIn() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[#022C12] mb-2">Customer Dashboard</h1>
        <p className="text-[#4D4D4D] mb-8">Sign in with your HubSpot account to continue</p>
        <button
          onClick={() => signIn("hubspot", { callbackUrl: "/" })}
          className="bg-[#022C12] text-white px-6 py-3 rounded-lg font-medium hover:opacity-90 transition-opacity"
        >
          Sign in with HubSpot
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create SessionProvider wrapper**

Create `src/components/SessionWrapper.tsx`:

```tsx
"use client";

import { SessionProvider } from "next-auth/react";

export default function SessionWrapper({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

- [ ] **Step 5: Create AuthGate component**

Create `src/components/AuthGate.tsx`:

```tsx
"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-[#4D4D4D]">Loading...</div>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return <>{children}</>;
}
```

- [ ] **Step 6: Update root layout to include providers**

Update `src/app/layout.tsx` to wrap children with `SessionWrapper`.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/auth/ src/app/auth/ src/components/SessionWrapper.tsx src/components/AuthGate.tsx src/app/layout.tsx
git commit -m "feat: add HubSpot OAuth authentication with NextAuth"
```

---

## Task 6: API Routes

**Files:**
- Create: `src/app/api/companies/search/route.ts`
- Create: `src/app/api/companies/[id]/route.ts`

- [ ] **Step 1: Create search API route**

Create `src/app/api/companies/search/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { searchCompanies } from "@/lib/hubspot";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const results = await searchCompanies(query);
  return NextResponse.json(results);
}
```

- [ ] **Step 2: Create company detail API route with caching**

Create `src/app/api/companies/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getCompanyDetail, getOwners, getDealStages } from "@/lib/hubspot";
import { Cache } from "@/lib/cache";
import { CompanyDetail, OwnerMap, StageMap } from "@/lib/types";

const companyCache = new Cache<CompanyDetail>(5 * 60 * 1000);
const ownerCache = new Cache<OwnerMap>(60 * 60 * 1000);
const stageCache = new Cache<StageMap>(60 * 60 * 1000);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const cached = companyCache.get(id);
  if (cached) {
    const owners = await getCachedOwners();
    const stages = await getCachedStages();
    return NextResponse.json({ ...cached, owners, stages });
  }

  try {
    const detail = await getCompanyDetail(id);
    companyCache.set(id, detail);

    const [owners, stages] = await Promise.all([
      getCachedOwners(),
      getCachedStages(),
    ]);

    return NextResponse.json({ ...detail, owners, stages });
  } catch {
    return NextResponse.json(
      { error: "Could not load company data" },
      { status: 500 }
    );
  }
}

async function getCachedOwners(): Promise<OwnerMap> {
  const cached = ownerCache.get("owners");
  if (cached) return cached;
  const owners = await getOwners();
  ownerCache.set("owners", owners);
  return owners;
}

async function getCachedStages(): Promise<StageMap> {
  const cached = stageCache.get("stages");
  if (cached) return cached;
  const stages = await getDealStages();
  stageCache.set("stages", stages);
  return stages;
}
```

- [ ] **Step 3: Verify dev server starts with new routes**

Run: `npm run dev`
Expected: No errors. Routes accessible at `/api/companies/search?q=test` and `/api/companies/123`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/companies/
git commit -m "feat: add company search and detail API routes with caching"
```

---

## Task 7: FieldRenderer and Skeleton Components

**Files:**
- Create: `src/components/FieldRenderer.tsx`
- Create: `src/components/Skeleton.tsx`
- Create: `src/__tests__/components/FieldRenderer.test.tsx`

- [ ] **Step 1: Write failing FieldRenderer tests**

Create `src/__tests__/components/FieldRenderer.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldRenderer } from "@/components/FieldRenderer";

describe("FieldRenderer", () => {
  it("renders currency formatted value", () => {
    render(<FieldRenderer value="2400" format="currency" />);
    expect(screen.getByText("2 400 kr")).toBeTruthy();
  });

  it("renders dash for null values", () => {
    render(<FieldRenderer value={null} format="text" />);
    expect(screen.getByText("-")).toBeTruthy();
  });

  it("renders link as anchor tag", () => {
    const { container } = render(<FieldRenderer value="example.com" format="link" />);
    const link = container.querySelector("a");
    expect(link).toBeTruthy();
    expect(link?.textContent).toBe("example.com");
  });

  it("renders badge with styling", () => {
    const { container } = render(<FieldRenderer value="Active Customer" format="badge" />);
    const badge = container.querySelector("span");
    expect(badge?.textContent).toBe("Active Customer");
  });

  it("renders invoiceStatus with correct color for Overdue", () => {
    const { container } = render(<FieldRenderer value="Overdue" format="invoiceStatus" />);
    const el = container.querySelector("span");
    expect(el?.textContent).toBe("Overdue");
    expect(el?.className).toContain("text-red");
  });

  it("renders invoiceStatus with correct color for Open", () => {
    const { container } = render(<FieldRenderer value="Open" format="invoiceStatus" />);
    const el = container.querySelector("span");
    expect(el?.className).toContain("text-orange");
  });

  it("renders invoiceStatus with correct color for Paid", () => {
    const { container } = render(<FieldRenderer value="Paid" format="invoiceStatus" />);
    const el = container.querySelector("span");
    expect(el?.className).toContain("text-green");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/components/FieldRenderer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement FieldRenderer**

Create `src/components/FieldRenderer.tsx`:

```tsx
import { FormatType } from "@/lib/types";
import { formatValue } from "@/lib/format";

interface Props {
  value: string | null | undefined;
  format: FormatType;
}

export function FieldRenderer({ value, format }: Props) {
  const formatted = formatValue(value, format);

  if (formatted === "-") {
    return <span className="text-[#9ca3af]">-</span>;
  }

  switch (format) {
    case "link":
      return (
        <a
          href={`https://${formatted}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#022C12] underline hover:opacity-70"
        >
          {formatted}
        </a>
      );

    case "badge":
      return (
        <span className="inline-block bg-[#f0fdf4] text-[#022C12] px-2 py-0.5 rounded text-sm">
          {formatted}
        </span>
      );

    case "invoiceStatus": {
      const colorClass =
        formatted === "Overdue"
          ? "text-red-600"
          : formatted === "Open"
          ? "text-orange-500"
          : "text-green-600";
      return <span className={`font-semibold ${colorClass}`}>{formatted}</span>;
    }

    default:
      return <span>{formatted}</span>;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/components/FieldRenderer.test.tsx`
Expected: All 7 tests PASS

- [ ] **Step 5: Create Skeleton component**

Create `src/components/Skeleton.tsx`:

```tsx
export function SkeletonCard() {
  return (
    <div className="bg-[#f0fdf4] rounded-2xl p-4 animate-pulse">
      <div className="h-3 w-16 bg-[#d1d5db] rounded mb-2" />
      <div className="h-6 w-24 bg-[#d1d5db] rounded" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="flex justify-between py-2 animate-pulse">
      <div className="h-4 w-24 bg-[#e5e7eb] rounded" />
      <div className="h-4 w-32 bg-[#e5e7eb] rounded" />
    </div>
  );
}

export function SkeletonBlock() {
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4 animate-pulse">
      <div className="h-5 w-32 bg-[#e5e7eb] rounded mb-4" />
      <div className="space-y-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/FieldRenderer.tsx src/components/Skeleton.tsx src/__tests__/components/FieldRenderer.test.tsx
git commit -m "feat: add FieldRenderer with format-aware rendering and Skeleton loaders"
```

---

## Task 8: SearchBar Component

**Files:**
- Create: `src/components/SearchBar.tsx`

- [ ] **Step 1: Implement SearchBar with autocomplete**

Create `src/components/SearchBar.tsx`:

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { CompanySearchResult } from "@/lib/types";

interface Props {
  onSelect: (company: CompanySearchResult) => void;
}

export function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanySearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setIsOpen(data.length > 0);
        setHighlightIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  function handleSelect(company: CompanySearchResult) {
    setQuery(company.name);
    setIsOpen(false);
    onSelect(company);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search company..."
          className="w-full bg-white/15 text-white placeholder-white/60 rounded-lg px-4 py-2 outline-none focus:bg-white/20 transition-colors"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border border-[#e5e7eb] shadow-lg overflow-hidden z-50">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-[#9ca3af] text-sm">No companies found</div>
          ) : (
            results.map((company, index) => (
              <button
                key={company.id}
                onClick={() => handleSelect(company)}
                className={`w-full text-left px-4 py-3 border-t border-[#f3f4f6] first:border-t-0 hover:bg-[#f0fdf4] transition-colors ${
                  index === highlightIndex ? "bg-[#f0fdf4] border-l-2 border-l-[#022C12]" : ""
                }`}
              >
                <div className="font-medium text-[#022C12]">{company.name}</div>
                {company.domain && (
                  <div className="text-xs text-[#9ca3af]">{company.domain}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders in dev**

Start dev server, import SearchBar into page.tsx temporarily to confirm it renders.

- [ ] **Step 3: Commit**

```bash
git add src/components/SearchBar.tsx
git commit -m "feat: add SearchBar with debounced autocomplete and keyboard navigation"
```

---

## Task 9: Company Detail Components

**Files:**
- Create: `src/components/CompanyHeader.tsx`
- Create: `src/components/MetricCards.tsx`
- Create: `src/components/TabContainer.tsx`
- Create: `src/components/OverviewTab.tsx`
- Create: `src/components/ActivityTab.tsx`
- Create: `src/components/TasksTab.tsx`

- [ ] **Step 1: Create CompanyHeader**

Create `src/components/CompanyHeader.tsx`:

```tsx
import { OwnerMap } from "@/lib/types";

interface Props {
  companyId: string;
  company: Record<string, string>;
  owners: OwnerMap;
}

export function CompanyHeader({ companyId, company, owners }: Props) {
  const name = company.name || "Unknown Company";
  const domain = company.domain || "";
  const ownerName = owners[company.hubspot_owner_id] || "-";
  const lastContacted = company.notes_last_contacted
    ? formatRelativeDate(company.notes_last_contacted)
    : "-";

  const portalId = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;
  const hubspotUrl = portalId
    ? `https://app.hubspot.com/contacts/${portalId}/company/${companyId}`
    : null;

  return (
    <div className="flex justify-between items-center mb-4">
      <div>
        <h1 className="text-2xl font-bold text-[#022C12]">{name}</h1>
        <p className="text-sm text-[#9ca3af]">
          {domain} &middot; Owner: {ownerName} &middot; Last contacted: {lastContacted}
        </p>
      </div>
      {hubspotUrl && (
        <a
          href={hubspotUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[#022C12] underline hover:opacity-70"
        >
          Open in HubSpot
        </a>
      )}
    </div>
  );
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return date.toISOString().split("T")[0];
}
```

- [ ] **Step 2: Create MetricCards**

Create `src/components/MetricCards.tsx`:

```tsx
import { dashboardConfig } from "@/config/hubspot-fields";
import { formatValue } from "@/lib/format";

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
}

export function MetricCards({ company, deal }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 mb-6">
      {dashboardConfig.metricCards.map((card) => {
        const source = card.source === "deal" ? deal : company;
        const value = source?.[card.property] ?? null;
        const formatted = formatValue(value, card.format);
        const isInvoice = card.format === "invoiceStatus";

        let colorClass = "text-[#022C12]";
        if (isInvoice) {
          colorClass =
            formatted === "Overdue"
              ? "text-red-600"
              : formatted === "Open"
              ? "text-orange-500"
              : "text-green-600";
        }

        return (
          <div key={card.property} className="bg-[#f0fdf4] rounded-2xl p-4">
            <div className="text-[#6b7280] text-xs uppercase tracking-wide mb-1">
              {card.label}
            </div>
            <div className={`text-xl font-bold ${colorClass}`}>{formatted}</div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create TabContainer**

Create `src/components/TabContainer.tsx`:

```tsx
"use client";

import { useState } from "react";

interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface Props {
  tabs: Tab[];
}

export function TabContainer({ tabs }: Props) {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || "");

  return (
    <div>
      <div className="flex border-b-2 border-[#e5e7eb] mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 -mb-[2px] transition-colors ${
              activeTab === tab.id
                ? "border-b-2 border-[#022C12] text-[#022C12] font-semibold"
                : "text-[#9ca3af] hover:text-[#4D4D4D]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {tabs.find((t) => t.id === activeTab)?.content}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create OverviewTab**

Create `src/components/OverviewTab.tsx`:

```tsx
import { dashboardConfig } from "@/config/hubspot-fields";
import { FieldRenderer } from "./FieldRenderer";
import { OwnerMap, StageMap } from "@/lib/types";

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  owners: OwnerMap;
  stages: StageMap;
}

export function OverviewTab({ company, deal, owners, stages }: Props) {
  function resolveValue(property: string, source: Record<string, string> | null, format: string): string | null {
    const raw = source?.[property] ?? null;
    if (!raw) return null;
    if (format === "owner") return owners[raw] || raw;
    if (format === "badge" && property === "dealstage") return stages[raw] || raw;
    return raw;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
        <h3 className="font-semibold text-[#022C12] mb-3">Company Info</h3>
        <div className="space-y-2">
          {dashboardConfig.tabs.overview.companyInfo.map((field) => (
            <div key={field.property} className="flex justify-between text-sm">
              <span className="text-[#9ca3af]">{field.label}</span>
              <FieldRenderer
                value={resolveValue(field.property, company, field.format)}
                format={field.format}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
        <h3 className="font-semibold text-[#022C12] mb-3">Lifecycle Deal</h3>
        {deal ? (
          <div className="space-y-2">
            {dashboardConfig.tabs.overview.dealInfo.map((field) => (
              <div key={field.property} className="flex justify-between text-sm">
                <span className="text-[#9ca3af]">{field.label}</span>
                <FieldRenderer
                  value={resolveValue(field.property, deal, field.format)}
                  format={field.format}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#9ca3af] text-sm">No lifecycle deal found</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create ActivityTab**

Create `src/components/ActivityTab.tsx`:

```tsx
import { Engagement, OwnerMap } from "@/lib/types";

interface Props {
  engagements: Engagement[];
  owners: OwnerMap;
}

const TYPE_ICONS: Record<string, string> = {
  call: "phone",
  meeting: "calendar",
  note: "file-text",
  email: "mail",
};

const TYPE_COLORS: Record<string, string> = {
  call: "bg-blue-100 text-blue-700",
  meeting: "bg-purple-100 text-purple-700",
  note: "bg-yellow-100 text-yellow-700",
  email: "bg-green-100 text-green-700",
};

export function ActivityTab({ engagements, owners }: Props) {
  if (engagements.length === 0) {
    return <p className="text-[#9ca3af] text-sm py-4">No activity in the last 90 days</p>;
  }

  return (
    <div className="space-y-3">
      {engagements.map((engagement, index) => (
        <div
          key={`${engagement.type}-${engagement.timestamp}-${index}`}
          className="bg-white border border-[#e5e7eb] rounded-2xl p-4"
        >
          <div className="flex items-start gap-3">
            <span
              className={`inline-block px-2 py-1 rounded text-xs font-medium capitalize ${
                TYPE_COLORS[engagement.type] || "bg-gray-100 text-gray-700"
              }`}
            >
              {engagement.type}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <h4 className="font-medium text-[#022C12] text-sm truncate">
                  {engagement.title}
                </h4>
                <span className="text-xs text-[#9ca3af] whitespace-nowrap ml-2">
                  {formatTimestamp(engagement.timestamp)}
                </span>
              </div>
              {engagement.bodyPreview && (
                <p className="text-sm text-[#4D4D4D] mt-1 line-clamp-2">
                  {stripHtml(engagement.bodyPreview)}
                </p>
              )}
              <div className="flex gap-3 mt-1 text-xs text-[#9ca3af]">
                {engagement.direction && <span>Direction: {engagement.direction}</span>}
                {engagement.outcome && <span>Outcome: {engagement.outcome}</span>}
                {engagement.owner && <span>By: {owners[engagement.owner] || engagement.owner}</span>}
                {engagement.fromEmail && <span>From: {engagement.fromEmail}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTimestamp(ts: string): string {
  const date = new Date(parseInt(ts) || ts);
  if (isNaN(date.getTime())) return ts;
  return date.toLocaleDateString("sv-SE");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
```

- [ ] **Step 6: Create TasksTab**

Create `src/components/TasksTab.tsx`:

```tsx
import { TaskItem, OwnerMap } from "@/lib/types";

interface Props {
  tasks: TaskItem[];
  owners: OwnerMap;
}

export function TasksTab({ tasks, owners }: Props) {
  if (tasks.length === 0) {
    return <p className="text-[#9ca3af] text-sm py-4">No upcoming tasks</p>;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task, index) => (
        <div
          key={`${task.subject}-${task.dueDate}-${index}`}
          className="bg-white border border-[#e5e7eb] rounded-2xl p-4 flex items-center justify-between"
        >
          <div>
            <h4 className="font-medium text-[#022C12] text-sm">{task.subject || "-"}</h4>
            <div className="text-xs text-[#9ca3af] mt-1">
              {owners[task.owner] || task.owner || "-"} &middot; Due: {formatDate(task.dueDate)}
            </div>
          </div>
          <span className="inline-block bg-[#f0fdf4] text-[#022C12] px-2 py-1 rounded text-xs font-medium">
            {task.status || "-"}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr || "-";
  return date.toLocaleDateString("sv-SE");
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/CompanyHeader.tsx src/components/MetricCards.tsx src/components/TabContainer.tsx src/components/OverviewTab.tsx src/components/ActivityTab.tsx src/components/TasksTab.tsx
git commit -m "feat: add company detail components (header, metrics, tabs, overview, activity, tasks)"
```

---

## Task 10: Main Dashboard Page

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Implement main page with all components**

Replace `src/app/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { CompanyHeader } from "@/components/CompanyHeader";
import { MetricCards } from "@/components/MetricCards";
import { TabContainer } from "@/components/TabContainer";
import { OverviewTab } from "@/components/OverviewTab";
import { ActivityTab } from "@/components/ActivityTab";
import { TasksTab } from "@/components/TasksTab";
import { SkeletonCard, SkeletonBlock } from "@/components/Skeleton";
import AuthGate from "@/components/AuthGate";
import { CompanySearchResult, CompanyDetail, OwnerMap, StageMap } from "@/lib/types";

interface CompanyData extends CompanyDetail {
  owners: OwnerMap;
  stages: StageMap;
}

export default function Dashboard() {
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(company: CompanySearchResult) {
    setIsLoading(true);
    setError(null);
    setSelectedCompanyId(company.id);
    try {
      const res = await fetch(`/api/companies/${company.id}`);
      if (!res.ok) throw new Error("Failed to load company data");
      const data = await res.json();
      setCompanyData(data);
    } catch {
      setError("Could not load data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthGate>
      <div className="min-h-screen bg-white">
        {/* Top bar */}
        <nav className="bg-[#022C12] px-6 py-3 flex items-center justify-between">
          <span className="text-white font-bold text-lg">Customer Dashboard</span>
          <SearchBar onSelect={handleSelect} />
        </nav>

        {/* Content */}
        <main className="max-w-6xl mx-auto px-6 py-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex justify-between items-center">
              <span className="text-red-700 text-sm">{error}</span>
              <button
                onClick={() => setError(null)}
                className="text-red-700 text-sm underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {!companyData && !isLoading && (
            <div className="flex items-center justify-center min-h-[60vh]">
              <p className="text-[#9ca3af] text-lg">Search for a company to get started</p>
            </div>
          )}

          {isLoading && (
            <div>
              <div className="mb-4 animate-pulse">
                <div className="h-8 w-64 bg-[#e5e7eb] rounded mb-2" />
                <div className="h-4 w-96 bg-[#e5e7eb] rounded" />
              </div>
              <div className="grid grid-cols-4 gap-3 mb-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <SkeletonBlock />
                <SkeletonBlock />
              </div>
            </div>
          )}

          {companyData && !isLoading && (
            <>
              <CompanyHeader
                companyId={selectedCompanyId!}
                company={companyData.company}
                owners={companyData.owners}
              />
              <MetricCards
                company={companyData.company}
                deal={companyData.deal}
              />
              <TabContainer
                tabs={[
                  {
                    id: "overview",
                    label: "Overview",
                    content: (
                      <OverviewTab
                        company={companyData.company}
                        deal={companyData.deal}
                        owners={companyData.owners}
                        stages={companyData.stages}
                      />
                    ),
                  },
                  {
                    id: "activity",
                    label: "Activity",
                    content: (
                      <ActivityTab
                        engagements={companyData.engagements}
                        owners={companyData.owners}
                      />
                    ),
                  },
                  {
                    id: "tasks",
                    label: "Tasks",
                    content: (
                      <TasksTab
                        tasks={companyData.tasks}
                        owners={companyData.owners}
                      />
                    ),
                  },
                ]}
              />
            </>
          )}
        </main>
      </div>
    </AuthGate>
  );
}
```

- [ ] **Step 2: Verify the full page renders in dev**

Run: `npm run dev`
Navigate to localhost:3000. Expected: Green nav bar with search, empty state message visible.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: assemble main dashboard page with search, metrics, and tabbed detail view"
```

---

## Task 11: Final Verification and Cleanup

**Files:**
- Modify: `.gitignore` (add `.superpowers/`)
- Verify: all tests pass, dev server works, build succeeds

- [ ] **Step 1: Add .superpowers to gitignore**

Append `.superpowers/` to `.gitignore`.

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (cache, format, hubspot, FieldRenderer)

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 4: Verify dev server manually**

Run: `npm run dev`
Check:
- Page loads at localhost:3000
- Green nav bar with search bar visible
- Empty state message shows
- Search input is functional (will show "No companies found" without real HubSpot token)

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "chore: add .superpowers to gitignore and verify build"
```
