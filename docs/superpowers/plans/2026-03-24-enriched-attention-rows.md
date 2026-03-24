# Enriched Attention Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 inline metric chips (Health, Volume 12m, Trend, Pay) to every company row in the Needs Attention list.

**Architecture:** Extend `AttentionCompany` with new fields, enrich data in each signal builder, render chips via a new `MetricChips` component. Volume abbreviation and trend computation are pure utility functions with tests.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-24-enriched-attention-rows-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/lib/types.ts` | Add new fields to `AttentionCompany` |
| Modify | `src/lib/health-score.ts` | Fix "Critical" -> "Critical Churn Risk" |
| Modify | `src/lib/health-score.test.ts` | Add tests for getHealthLabel and getHealthColor (append to existing file) |
| Modify | `src/lib/format.ts` | Add `abbreviateEur()` and `computeVolumeTrend()` utilities |
| Create | `src/lib/format.test.ts` | Tests for new utility functions |
| Create | `src/components/MetricChips.tsx` | Renders the 4 inline chips |
| Modify | `src/lib/attention.ts` | Enrich all 6 signal builders with new fields |
| Modify | `src/components/AttentionGroup.tsx` | Integrate MetricChips into CompanyRow, dedup detail lines |
| Modify | `src/app/preview/page.tsx` | Add mock data for new fields |

---

### Task 1: Fix scoreToLabel and add test

**Files:**
- Modify: `src/lib/health-score.ts:10`
- Modify: `src/lib/health-score.test.ts` (append new describe blocks - file already has `getHealthTrend` tests)

- [ ] **Step 1: Write test for health score labels**

Append these `describe` blocks to the existing `src/lib/health-score.test.ts` file (which already imports from vitest and has tests for `getHealthTrend`). Add `getHealthLabel` and `getHealthColor` to the existing import:

```ts
// APPEND to existing src/lib/health-score.test.ts
// Update import to include getHealthLabel, getHealthColor

describe("getHealthLabel", () => {
  it("returns Healthy for scores >= 80", () => {
    expect(getHealthLabel("80")).toBe("Healthy");
    expect(getHealthLabel("100")).toBe("Healthy");
  });

  it("returns Monitor for scores 60-79", () => {
    expect(getHealthLabel("60")).toBe("Monitor");
    expect(getHealthLabel("79")).toBe("Monitor");
  });

  it("returns At Risk for scores 40-59", () => {
    expect(getHealthLabel("40")).toBe("At Risk");
    expect(getHealthLabel("59")).toBe("At Risk");
  });

  it("returns Critical Churn Risk for scores < 40", () => {
    expect(getHealthLabel("39")).toBe("Critical Churn Risk");
    expect(getHealthLabel("0")).toBe("Critical Churn Risk");
  });

  it("returns input string for non-numeric values", () => {
    expect(getHealthLabel("N/A")).toBe("N/A");
  });
});

describe("getHealthColor", () => {
  it("returns green for healthy", () => {
    expect(getHealthColor("80")).toEqual({ bg: "#D1FAE5", text: "#065F46" });
  });

  it("returns red for critical", () => {
    expect(getHealthColor("20")).toEqual({ bg: "#FEE2E2", text: "#991B1B" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/health-score.test.ts`
Expected: FAIL on "Critical Churn Risk" assertion (currently returns "Critical")

- [ ] **Step 3: Fix scoreToLabel**

In `src/lib/health-score.ts`, line 10, change:
```ts
return "Critical";
```
to:
```ts
return "Critical Churn Risk";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/health-score.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/health-score.ts src/lib/health-score.test.ts
git commit -m "fix: scoreToLabel returns 'Critical Churn Risk' for scores below 40"
```

---

### Task 2: Add abbreviateEur and computeVolumeTrend utilities

**Files:**
- Modify: `src/lib/format.ts`
- Create: `src/lib/format.test.ts`

- [ ] **Step 1: Write tests for abbreviateEur**

```ts
// src/lib/format.test.ts
import { describe, it, expect } from "vitest";
import { abbreviateEur, computeVolumeTrend } from "./format";

describe("abbreviateEur", () => {
  it("returns '-' for zero or undefined", () => {
    expect(abbreviateEur(0)).toBe("-");
    expect(abbreviateEur(undefined)).toBe("-");
  });

  it("shows raw number below 1000", () => {
    expect(abbreviateEur(800)).toBe("€800");
  });

  it("abbreviates thousands as k", () => {
    expect(abbreviateEur(186000)).toBe("€186k");
    expect(abbreviateEur(1500)).toBe("€2k");
  });

  it("abbreviates millions as M with one decimal", () => {
    expect(abbreviateEur(1200000)).toBe("€1.2M");
    expect(abbreviateEur(999500)).toBe("€1.0M");
  });

  it("drops .0 on clean millions", () => {
    expect(abbreviateEur(2000000)).toBe("€2M");
  });
});

describe("computeVolumeTrend", () => {
  it("returns null when volume6m is missing", () => {
    expect(computeVolumeTrend(100, undefined)).toBeNull();
  });

  it("returns null when previous period is zero", () => {
    expect(computeVolumeTrend(5000, 5000)).toBeNull();
  });

  it("returns null when previous period is negative", () => {
    expect(computeVolumeTrend(6000, 5000)).toBeNull();
  });

  it("computes positive trend", () => {
    // 3m = 6000, 6m = 10000, previous 3m = 4000, change = +50%
    expect(computeVolumeTrend(6000, 10000)).toEqual({ direction: "up", percent: 50 });
  });

  it("computes negative trend", () => {
    // 3m = 3000, 6m = 10000, previous 3m = 7000, change = -57%
    expect(computeVolumeTrend(3000, 10000)).toEqual({ direction: "down", percent: 57 });
  });

  it("computes flat trend", () => {
    // 3m = 5000, 6m = 10000, previous 3m = 5000, change = 0%
    expect(computeVolumeTrend(5000, 10000)).toEqual({ direction: "flat", percent: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL (functions don't exist yet)

- [ ] **Step 3: Implement abbreviateEur and computeVolumeTrend**

Add to `src/lib/format.ts`:

```ts
export function abbreviateEur(value: number | undefined): string {
  if (!value) return "-";
  if (value < 1000) return `€${Math.round(value)}`;
  if (value < 999500) return `€${Math.round(value / 1000)}k`;
  const m = value / 1000000;
  const formatted = m % 1 === 0 ? `${m}` : m.toFixed(1);
  return `€${formatted}M`;
}

export interface VolumeTrend {
  direction: "up" | "down" | "flat";
  percent: number;
}

export function computeVolumeTrend(
  volume3m: number | undefined,
  volume6m: number | undefined
): VolumeTrend | null {
  if (volume3m === undefined || volume6m === undefined) return null;
  const previous3m = volume6m - volume3m;
  if (previous3m <= 0) return null;
  const change = Math.round(((volume3m - previous3m) / previous3m) * 100);
  if (change === 0) return { direction: "flat", percent: 0 };
  return {
    direction: change > 0 ? "up" : "down",
    percent: Math.abs(change),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/format.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: add abbreviateEur and computeVolumeTrend utilities"
```

---

### Task 3: Extend AttentionCompany type

**Files:**
- Modify: `src/lib/types.ts:99-112`

- [ ] **Step 1: Add new fields to AttentionCompany**

In `src/lib/types.ts`, add these fields to the `AttentionCompany` interface after line 111 (`enteredGroupAt?: string;`):

```ts
  healthScore?: string;
  volume12m?: number;
  volume3m?: number;
  volume6m?: number;
  payStatus?: string;
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run`
Expected: All existing tests PASS (new fields are optional)

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: extend AttentionCompany with health, volume, and pay fields"
```

---

### Task 4: Create MetricChips component

**Files:**
- Create: `src/components/MetricChips.tsx`

- [ ] **Step 1: Create the MetricChips component**

```tsx
// src/components/MetricChips.tsx
import { getHealthLabel, getHealthColor } from "@/lib/health-score";
import { abbreviateEur, computeVolumeTrend } from "@/lib/format";

interface Props {
  healthScore?: string;
  volume12m?: number;
  volume3m?: number;
  volume6m?: number;
  payStatus?: string;
}

export function MetricChips({ healthScore, volume12m, volume3m, volume6m, payStatus }: Props) {
  const trend = computeVolumeTrend(volume3m, volume6m);

  return (
    <div className="flex items-center gap-[5px] flex-wrap">
      <HealthChip score={healthScore} />
      <VolumeChip value={volume12m} />
      {trend && <TrendChip trend={trend} />}
      <PayChip status={payStatus} />
    </div>
  );
}

function HealthChip({ score }: { score?: string }) {
  if (!score) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-[7px] py-[2px] rounded-md bg-[#F3F2ED] text-[var(--green-100)] whitespace-nowrap">
        No score
      </span>
    );
  }
  const label = getHealthLabel(score);
  const colors = getHealthColor(score);
  const num = Math.round(parseFloat(score));

  return (
    <span
      className="inline-flex items-center gap-1 text-[10.5px] font-medium px-[7px] py-[2px] rounded-md whitespace-nowrap"
      style={{ background: colors.bg, color: colors.text }}
    >
      <span
        className="w-[6px] h-[6px] rounded-full shrink-0"
        style={{ background: colors.text }}
      />
      {label} ({num})
    </span>
  );
}

function VolumeChip({ value }: { value?: number }) {
  return (
    <span className="inline-flex items-center text-[10.5px] font-medium px-[7px] py-[2px] rounded-md bg-[#F3F2ED] text-[var(--green-100)] whitespace-nowrap">
      {abbreviateEur(value)}
    </span>
  );
}

function TrendChip({ trend }: { trend: { direction: "up" | "down" | "flat"; percent: number } }) {
  const arrow = trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "↔";

  let chipClass = "bg-[#F3F2ED] text-[var(--green-100)]"; // flat
  if (trend.direction === "up") chipClass = "bg-[#D1FAE5] text-[#065F46]";
  if (trend.direction === "down") chipClass = "bg-[rgba(192,57,43,0.1)] text-[var(--rust)]";

  return (
    <span className={`inline-flex items-center text-[10.5px] font-medium px-[7px] py-[2px] rounded-md whitespace-nowrap ${chipClass}`}>
      {arrow} {trend.percent}%
    </span>
  );
}

function PayChip({ status }: { status?: string }) {
  const isActive = status?.toLowerCase() === "active";
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-[7px] py-[2px] rounded-md bg-[#D1FAE5] text-[#065F46] whitespace-nowrap">
        <span className="w-[6px] h-[6px] rounded-full shrink-0 bg-[#065F46]" />
        Pay
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-[7px] py-[2px] rounded-md bg-[rgba(192,57,43,0.1)] text-[var(--rust)] whitespace-nowrap">
      <span className="w-[6px] h-[6px] rounded-full shrink-0 bg-[var(--rust)]" />
      No Pay
    </span>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx next build --no-lint 2>&1 | head -20` (or `npm run dev` and check for compile errors)

- [ ] **Step 3: Commit**

```bash
git add src/components/MetricChips.tsx
git commit -m "feat: add MetricChips component for attention row chips"
```

---

### Task 5: Enrich signal builders in attention.ts

**Files:**
- Modify: `src/lib/attention.ts`

This is the largest task. Each builder needs to:
1. Request additional company properties (`health_score`, `understory_booking_volume_12m`, `understory_booking_volume_3m`, `understory_booking_volume_6m`)
2. Add `understory_pay_status__customer` to `fetchDealForCompany` properties
3. Map the new fields onto each `AttentionCompany` object

- [ ] **Step 1: Add `understory_pay_status__customer` to fetchDealForCompany**

In `fetchDealForCompany`, add `"understory_pay_status__customer"` to the properties array (around line 47). The existing properties are:
```ts
["confirmed__contract_mrr", "deal_currency_code", "pipeline", "booking_fee"]
```
Change to:
```ts
["confirmed__contract_mrr", "deal_currency_code", "pipeline", "booking_fee", "understory_pay_status__customer"]
```

- [ ] **Step 2: Define a shared constant for the extra company properties**

At the top of the file (after imports), add:
```ts
const CHIP_COMPANY_PROPS = [
  "health_score",
  "understory_booking_volume_12m",
  "understory_booking_volume_3m",
  "understory_booking_volume_6m",
];
```

- [ ] **Step 3: Create a helper to map chip fields**

Add a helper function near the other utility functions:
```ts
function mapChipFields(
  companyProps: Record<string, string>,
  dealProps: Record<string, string> | null
): Pick<AttentionCompany, "healthScore" | "volume12m" | "volume3m" | "volume6m" | "payStatus"> {
  return {
    healthScore: companyProps.health_score || undefined,
    volume12m: parseFloat(companyProps.understory_booking_volume_12m || "0") || undefined,
    volume3m: parseFloat(companyProps.understory_booking_volume_3m || "0") || undefined,
    volume6m: parseFloat(companyProps.understory_booking_volume_6m || "0") || undefined,
    payStatus: dealProps?.understory_pay_status__customer || undefined,
  };
}
```

- [ ] **Step 4: Update fetchInvoices**

`fetchInvoices` has its own deal search (line 89-119) separate from `fetchDealForCompany`. It fetches deals via a search query, then gets company associations from those deals.

**4a.** Add `"understory_pay_status__customer"` to the deal search properties array (line 99):
```ts
properties: ["dealname", "confirmed__contract_mrr", "deal_currency_code", "booking_fee", "outstanding_amount", "invoice_due_date", "number_of_open_invoices", "understory_pay_status__customer"],
```

**4b.** Add `payStatus` to the `DealInfo` interface (line 107) and its mapping (line 108-119):
```ts
interface DealInfo { id: string; dealname: string; mrr: string; currency: string; bookingFee: string; outstandingAmount: string; invoiceDueDate: string; openInvoices: number; payStatus: string }
```
Add to the map: `payStatus: d.properties.understory_pay_status__customer || ""`

**4c.** Update the `fetchCompanyBatch` call (line 176) to include all CHIP_COMPANY_PROPS:
```ts
const companies = await fetchCompanyBatch(Array.from(companyMap.keys()), ["understory_company_country", ...CHIP_COMPANY_PROPS]);
```

**4d.** In the company enrichment loop (lines 177-196), after setting existing fields, spread chip fields. The deal props aren't available as a Record here, so construct manually:
```ts
// After entry.currency = "EUR"; (line 194)
const chipFields = mapChipFields(props, { understory_pay_status__customer: result?.deal.payStatus || "" } as Record<string, string>);
Object.assign(entry, chipFields);
```

Note: `fetchInvoices` constructs companies from deal->company associations. The `result` variable with deal info is only available in the earlier loop (line 149). A simpler approach: store `payStatus` on the companyMap entry when it's first created (line 160-171), then in the enrichment loop just use `mapChipFields(props, null)` and set `entry.payStatus` from the already-stored value.

- [ ] **Step 5: Update fetchOverdueTasks**

This builder calls `fetchCompanyBatch` with extra props (around line 290) and `fetchDealForCompany` per company (around line 303).

**5a.** Update extra props in `fetchCompanyBatch` call:
```ts
const companies = await fetchCompanyBatch(companyIds, ["understory_company_country", ...CHIP_COMPANY_PROPS]);
```

**5b.** In the loop where companies are enriched and deals fetched (around lines 295-311), after getting `deal` from `fetchDealForCompany`, spread chip fields:
```ts
const deal = await fetchDealForCompany(companyId);
// ... existing MRR computation ...
result.push({
  ...existingFields,
  ...mapChipFields(props, deal),
});
```

- [ ] **Step 6: Update fetchHealthScoreIssues**

Already requests `health_score` and `understory_booking_volume_12m`. Calls `fetchDealForCompany` per company (around line 401).

**6a.** Add missing volume props to the company search properties (around line 330):
```ts
properties: ["name", "health_score", "hubspot_owner_id", "understory_booking_volume_12m", "understory_booking_volume_3m", "understory_booking_volume_6m", "understory_company_country", "notes_last_contacted"],
```

**6b.** Spread `mapChipFields(companyProps, deal)` into each constructed `AttentionCompany` (around line 407).

- [ ] **Step 7: Update fetchGoneQuiet**

Calls `fetchCompanyBatch` with extra props and `fetchDealForCompany` per company (around line 460).

**7a.** Update extra props:
```ts
const companies = await fetchCompanyBatch(companyIds, ["notes_last_contacted", "understory_company_country", ...CHIP_COMPANY_PROPS]);
```

**7b.** Spread `mapChipFields(props, deal)` into each constructed `AttentionCompany`.

- [ ] **Step 8: Update fetchDecliningVolume**

Already requests `understory_booking_volume_3m`, `6m`, `12m`. Does NOT fetch deals.

**8a.** Add `health_score` to company search properties (around line 500).

**8b.** This builder does not call `fetchDealForCompany`. Rather than adding N extra API calls for `payStatus`, pass `null` as dealProps to `mapChipFields`. The Pay chip will show "No Pay" for these companies. This is acceptable since declining volume is derived from booking data, not deal data. If needed later, a batch deal-fetch can be added.

```ts
...mapChipFields(props, null),
```

- [ ] **Step 9: Update fetchChurnRisk**

This builder fetches deals via its own search query (like fetchInvoices) with a separate property list.

**9a.** Add `"understory_pay_status__customer"` to the deal search properties in the churn risk search query.

**9b.** Add CHIP_COMPANY_PROPS to the `fetchCompanyBatch` extra props call.

**9c.** Spread chip fields. Since this builder has deal properties available in the loop, construct a Record for `mapChipFields`:
```ts
...mapChipFields(companyProps, dealProps),
```

- [ ] **Step 10: Verify the app builds**

Run: `npm run dev` and verify no TypeScript errors. Hit `/api/attention` if HubSpot credentials are available, or check the preview page.

- [ ] **Step 11: Commit**

```bash
git add src/lib/attention.ts
git commit -m "feat: enrich all attention signal builders with chip data fields"
```

---

### Task 6: Integrate MetricChips into CompanyRow and apply deduplication

**Files:**
- Modify: `src/components/AttentionGroup.tsx`

- [ ] **Step 1: Import MetricChips**

Add at the top of `AttentionGroup.tsx`:
```ts
import { MetricChips } from "./MetricChips";
```

- [ ] **Step 2: Add chips to the CompanyRow layout**

In the `CompanyRow` component, inside the `row-top` div (the flex container on line 73), add the MetricChips after the MRR span:

```tsx
<div className="flex items-center justify-between">
  <span className="font-medium text-sm text-[var(--moss)]">{company.name}</span>
  <div className="flex items-center gap-2">
    <MetricChips
      healthScore={company.healthScore}
      volume12m={company.volume12m}
      volume3m={company.volume3m}
      volume6m={company.volume6m}
      payStatus={company.payStatus}
    />
    {company.mrr && company.mrr !== "-" && (
      <span className="text-xs font-medium text-[var(--moss)]">{company.mrr}</span>
    )}
  </div>
</div>
```

- [ ] **Step 3: Apply deduplication for health_score signal**

In the `signal === "health_score"` block (lines 96-111), remove the health category display since the chip now shows it. Keep only `previousCategory` and `categoryChangedAt`:

```tsx
{signal === "health_score" && (
  <>
    {company.previousCategory && (
      <span className="text-xs text-[var(--green-100)]">
        was {getHealthLabel(company.previousCategory)} ({Math.round(parseFloat(company.previousCategory))})
      </span>
    )}
    {company.categoryChangedAt && (
      <span className="text-xs text-[var(--green-100)]">
        changed {formatRelativeDate(company.categoryChangedAt)}
      </span>
    )}
  </>
)}
```

This requires importing `getHealthLabel`:
```ts
import { getHealthLabel } from "@/lib/health-score";
```

- [ ] **Step 4: Verify the app builds and renders**

Run: `npm run dev`, open localhost, check the preview page attention list.

- [ ] **Step 5: Commit**

```bash
git add src/components/AttentionGroup.tsx
git commit -m "feat: render MetricChips in attention rows with health dedup"
```

---

### Task 7: Update preview mock data

**Files:**
- Modify: `src/app/preview/page.tsx`

- [ ] **Step 1: Add chip fields to all mock AttentionCompany objects**

Update each mock company in the preview attention groups (around lines 149-181) to include the new fields. Example for existing companies:

```ts
// Nordic Kayak Tours (overdue invoice)
{ id: "101", name: "Nordic Kayak Tours", detail: "Nordic Kayak - Pro", ownerId: "1", mrr: "€25 000", currency: "EUR", daysOverdue: 3, enteredGroupAt: undefined,
  healthScore: "38", volume12m: 186000, volume3m: 52000, volume6m: 120000, payStatus: "Active" },

// Copenhagen Food Walks (overdue invoice)
{ id: "102", name: "Copenhagen Food Walks", detail: "Food Walks - Starter", ownerId: "2", mrr: "€8 000", currency: "EUR", daysOverdue: 14, enteredGroupAt: undefined,
  healthScore: "52", volume12m: 42000, volume3m: 8000, volume6m: 22000, payStatus: undefined },

// Stockholm Adventures (overdue task)
{ id: "103", name: "Stockholm Adventures", detail: "Send onboarding materials", ownerId: "1", daysOverdue: 2, mrr: "€5 000", currency: "EUR", enteredGroupAt: daysAgoISO(2),
  healthScore: "85", volume12m: 95000, volume3m: 28000, volume6m: 50000, payStatus: "Active" },

// Malmo Workshops (overdue task)
{ id: "104", name: "Malmo Workshops", detail: "Schedule Q1 review", ownerId: "2", daysOverdue: 8, mrr: "€3 500", currency: "EUR", enteredGroupAt: daysAgoISO(8),
  healthScore: "61", volume12m: 31000, volume3m: 6000, volume6m: 16000, payStatus: "Active" },

// Gothenburg Experiences (overdue task)
{ id: "105", name: "Gothenburg Experiences", detail: "Follow up on payment setup", ownerId: "1", daysOverdue: 15, mrr: "€15 000", currency: "EUR", enteredGroupAt: daysAgoISO(15),
  healthScore: "45", volume12m: 220000, volume3m: 40000, volume6m: 110000, payStatus: undefined },

// Bergen Outdoor Co (health score)
{ id: "106", name: "Bergen Outdoor Co", detail: "28", ownerId: "1", mrr: "€10 000", currency: "EUR", previousCategory: "45", categoryChangedAt: "2026-03-18T10:00:00.000Z", enteredGroupAt: "2026-03-18T10:00:00.000Z",
  healthScore: "28", volume12m: 310000, volume3m: 50000, volume6m: 145000, payStatus: "Active" },

// Helsinki Tasting Club (health score)
{ id: "107", name: "Helsinki Tasting Club", detail: "42", ownerId: "2", mrr: "€30 000", currency: "EUR", previousCategory: "68", categoryChangedAt: "2026-03-10T14:00:00.000Z", enteredGroupAt: "2026-03-10T14:00:00.000Z",
  healthScore: "42", volume12m: 89000, volume3m: 22000, volume6m: 44000, payStatus: "Active" },

// Oslo Creative Labs (gone quiet)
{ id: "108", name: "Oslo Creative Labs", detail: "Last contacted 62 days ago", ownerId: "2", daysSilent: 62, mrr: "€15 000", currency: "EUR", enteredGroupAt: daysAgoISO(62),
  healthScore: "78", volume12m: 215000, volume3m: 62000, volume6m: 108000, payStatus: "Active" },

// Aarhus Adventure Park (gone quiet)
{ id: "109", name: "Aarhus Adventure Park", detail: "Last contacted 51 days ago", ownerId: "1", daysSilent: 51, mrr: "€12 000", currency: "EUR", enteredGroupAt: daysAgoISO(51),
  healthScore: "48", volume12m: 56000, volume3m: 10000, volume6m: 34000, payStatus: undefined },

// Tampere Escape Rooms (gone quiet)
{ id: "110", name: "Tampere Escape Rooms", detail: "Last contacted 48 days ago", ownerId: "1", daysSilent: 48, mrr: "€9 000", currency: "EUR", enteredGroupAt: daysAgoISO(48),
  healthScore: "71", volume12m: 130000, volume3m: 35000, volume6m: 67000, payStatus: "Active" },
```

- [ ] **Step 2: Verify preview renders correctly**

Run: `npm run dev`, open the preview page, confirm all 4 chips render on each row with correct colors and values. Verify health score group rows don't show the health category in both the detail line and the chip.

- [ ] **Step 3: Commit**

```bash
git add src/app/preview/page.tsx
git commit -m "feat: add chip mock data to preview attention companies"
```

---

### Task 8: Run all tests and verify

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass including new health-score and format tests.

- [ ] **Step 2: Verify dev server works**

Run: `npm run dev`, open localhost, check:
- Preview page: chips render on all attention rows
- Health chips show correct colors (green/amber/orange/red)
- Volume abbreviation looks right (€186k, €310k, etc.)
- Trend arrows show correct direction and color
- Pay chips show green "Pay" or red "No Pay"
- Health score group rows don't duplicate health info
- No console errors

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: cleanup after enriched attention rows implementation"
```
