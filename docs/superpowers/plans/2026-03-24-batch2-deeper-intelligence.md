# Batch 2: Deeper Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add health score badges with trend, timeline context on attention signals, and snooze/dismiss functionality to the dashboard.

**Architecture:** Three independent feature tracks that integrate into existing components. Health badge is a new component in CompanyHeader. Timeline context is computed server-side and displayed in AttentionGroup. Snooze is a localStorage CRUD module (same pattern as recent-companies) with UI in AttentionGroup. No new dependencies.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-24-batch2-deeper-intelligence-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/HealthBadge.tsx` | Health score pill badge with trend arrow |
| `src/lib/health-score.ts` | Health score category ordering and trend calculation |
| `src/lib/health-score.test.ts` | Tests for trend logic |
| `src/lib/snooze.ts` | localStorage CRUD for snoozed companies |
| `src/lib/snooze.test.ts` | Tests for snooze logic |
| `src/lib/timeline.ts` | Duration formatting for "in group Xd" labels |
| `src/lib/timeline.test.ts` | Tests for timeline formatting |
| `src/components/SnoozePopover.tsx` | Snooze preset/custom date popover |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/types.ts` | Add `enteredGroupAt?: string` to `AttentionCompany` |
| `src/components/CompanyHeader.tsx` | Add `previousCategory?` prop, render `HealthBadge` |
| `src/components/AttentionGroup.tsx` | Add timeline labels, snooze icon + popover, snoozed items toggle |
| `src/components/AttentionList.tsx` | Exclude snoozed companies from summary counts |
| `src/app/page.tsx` | Add `attentionMetaRef` for passing trend data to CompanyHeader |
| `src/app/api/attention/route.ts` | Compute `enteredGroupAt` on each company |

---

## Task 1: Health Score Trend Logic

**Files:**
- Create: `src/lib/health-score.ts`
- Create: `src/lib/health-score.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/health-score.test.ts
import { describe, it, expect } from "vitest";
import { getHealthTrend, type HealthTrend } from "./health-score";

describe("getHealthTrend", () => {
  it("returns improving when moving toward Healthy", () => {
    const result = getHealthTrend("Monitor", "At Risk");
    expect(result).toEqual({ direction: "improving", previous: "At Risk" });
  });

  it("returns declining when moving away from Healthy", () => {
    const result = getHealthTrend("At Risk", "Healthy");
    expect(result).toEqual({ direction: "declining", previous: "Healthy" });
  });

  it("returns null when no previous category", () => {
    expect(getHealthTrend("Healthy", undefined)).toBeNull();
  });

  it("returns null when categories are the same", () => {
    expect(getHealthTrend("Monitor", "Monitor")).toBeNull();
  });

  it("handles Critical Churn Risk correctly", () => {
    const result = getHealthTrend("Critical Churn Risk", "At Risk");
    expect(result).toEqual({ direction: "declining", previous: "At Risk" });
  });

  it("handles full recovery", () => {
    const result = getHealthTrend("Healthy", "Critical Churn Risk");
    expect(result).toEqual({ direction: "improving", previous: "Critical Churn Risk" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/health-score.test.ts`
Expected: FAIL - cannot find module

- [ ] **Step 3: Implement health score logic**

```typescript
// src/lib/health-score.ts
const CATEGORY_ORDER = ["Healthy", "Monitor", "At Risk", "Critical Churn Risk"];

export interface HealthTrend {
  direction: "improving" | "declining";
  previous: string;
}

export function getHealthTrend(
  current: string,
  previous: string | undefined
): HealthTrend | null {
  if (!previous || current === previous) return null;

  const currentIndex = CATEGORY_ORDER.indexOf(current);
  const previousIndex = CATEGORY_ORDER.indexOf(previous);

  if (currentIndex === -1 || previousIndex === -1) return null;

  return {
    direction: currentIndex < previousIndex ? "improving" : "declining",
    previous,
  };
}

export function getHealthColor(category: string): { bg: string; text: string } {
  switch (category) {
    case "Healthy":
      return { bg: "#D1FAE5", text: "#065F46" };
    case "Monitor":
      return { bg: "#FEF3C7", text: "#92400E" };
    case "At Risk":
      return { bg: "#FED7AA", text: "#9A3412" };
    case "Critical Churn Risk":
      return { bg: "#FEE2E2", text: "#991B1B" };
    default:
      return { bg: "#F3F4F6", text: "#374151" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/health-score.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/health-score.ts src/lib/health-score.test.ts
git commit -m "feat: add health score trend logic with tests"
```

---

## Task 2: HealthBadge Component

**Files:**
- Create: `src/components/HealthBadge.tsx`
- Modify: `src/components/CompanyHeader.tsx`

- [ ] **Step 1: Create HealthBadge component**

```tsx
// src/components/HealthBadge.tsx
"use client";

import { getHealthTrend, getHealthColor } from "@/lib/health-score";

interface Props {
  category: string;
  previousCategory?: string;
}

export default function HealthBadge({ category, previousCategory }: Props) {
  const { bg, text } = getHealthColor(category);
  const trend = getHealthTrend(category, previousCategory);

  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: bg, color: text }}
    >
      {category}
      {trend && (
        <>
          <span className="text-[10px]">
            {trend.direction === "improving" ? "\u2191" : "\u2193"}
          </span>
          <span className="text-[10px] font-normal opacity-70">
            was {trend.previous}
          </span>
        </>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Add HealthBadge to CompanyHeader**

Modify `src/components/CompanyHeader.tsx`:
- Add prop: `previousCategory?: string` (note: `categoryChangedAt` is NOT needed as a prop since we don't display it in the header)
- Import `HealthBadge` from `./HealthBadge`
- After the company name `<h2>`, render:
  ```tsx
  {company["Health Score Category"] && (
    <HealthBadge
      category={company["Health Score Category"]}
      previousCategory={previousCategory}
    />
  )}
  ```
- Wrap the company name and badge in a flex row with `items-center gap-2`

- [ ] **Step 3: Verify in browser**

Run: `npm run dev` and check `/preview`. Note: the mock company currently has `"Health Score Category": "Good"` which is not a valid category - it will show with gray default color. This gets fixed in Task 10 where we update mock data to use valid categories ("Healthy", "Monitor", "At Risk", "Critical Churn Risk").

- [ ] **Step 4: Commit**

```bash
git add src/components/HealthBadge.tsx src/components/CompanyHeader.tsx
git commit -m "feat: add health score badge with trend to company header"
```

---

## Task 3: Wire Attention Metadata to CompanyHeader

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add attentionMetaRef and pass to CompanyHeader**

Modify `page.tsx`:
- Add ref: `const attentionMetaRef = useRef<{ previousCategory?: string } | null>(null)`
- In `handleAttentionSelect`: before calling `fetchCompany`, look up the company's attention metadata. The attention data is fetched by `AttentionList` and not directly available in `page.tsx`. **Simpler approach:** Extend `handleAttentionSelect` to also accept optional metadata. Change the `AttentionList` `onSelectCompany` callback to pass attention metadata alongside the `CompanySearchResult`.

Actually, the cleanest approach: add an optional `attentionMeta` field to the handler. In `AttentionGroup`, the `CompanyRow` already has access to the `company` object (which includes `previousCategory` and `categoryChangedAt`). Pass it through:

- Change `AttentionGroup` props `onSelectCompany` to: `(company: CompanySearchResult, meta?: { previousCategory?: string }) => void`
- In `CompanyRow` onClick: pass `{ previousCategory: company.previousCategory }` as second arg
- In `AttentionList`: forward the second arg through to parent
- In `page.tsx` `handleAttentionSelect`: store meta in ref, pass `previousCategory` and `categoryChangedAt` to `CompanyHeader`
- In `handleBack` and `handleSearchSelect`: clear the ref to `null`

- [ ] **Step 2: Pass trend prop to CompanyHeader**

In the CompanyHeader render:
```tsx
<CompanyHeader
  companyId={selectedCompanyId!}
  company={companyData.company}
  deal={companyData.deal}
  owners={companyData.owners}
  showBack={navigationSource === "attention"}
  onBack={handleBack}
  previousCategory={attentionMetaRef.current?.previousCategory}
/>
```

- [ ] **Step 3: Verify in browser**

Check: Navigate to company from attention list with health_score signal - badge should show trend arrow.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/components/AttentionGroup.tsx src/components/AttentionList.tsx
git commit -m "feat: pass attention metadata for health score trend"
```

---

## Task 4: Timeline Duration Logic

**Files:**
- Create: `src/lib/timeline.ts`
- Create: `src/lib/timeline.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/timeline.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { formatGroupDuration } from "./timeline";

describe("formatGroupDuration", () => {
  const now = new Date("2026-03-24T12:00:00Z").getTime();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 'new today' for less than 24 hours", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const tenHoursAgo = new Date(now - 10 * 3600000).toISOString();
    expect(formatGroupDuration(tenHoursAgo)).toBe("new today");
  });

  it("returns 'in group 1d' for 1 day", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const oneDayAgo = new Date(now - 86400000).toISOString();
    expect(formatGroupDuration(oneDayAgo)).toBe("in group 1d");
  });

  it("returns 'in group 15d' for 15 days", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const fifteenDaysAgo = new Date(now - 15 * 86400000).toISOString();
    expect(formatGroupDuration(fifteenDaysAgo)).toBe("in group 15d");
  });

  it("returns 'in group 1mo' for 30+ days", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const thirtyFiveDaysAgo = new Date(now - 35 * 86400000).toISOString();
    expect(formatGroupDuration(thirtyFiveDaysAgo)).toBe("in group 1mo");
  });

  it("returns 'in group 2mo' for 60+ days", () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const sixtyFiveDaysAgo = new Date(now - 65 * 86400000).toISOString();
    expect(formatGroupDuration(sixtyFiveDaysAgo)).toBe("in group 2mo");
  });

  it("returns null for undefined input", () => {
    expect(formatGroupDuration(undefined)).toBeNull();
  });

  it("returns null for invalid date", () => {
    expect(formatGroupDuration("not-a-date")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/timeline.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement timeline formatting**

```typescript
// src/lib/timeline.ts
export function formatGroupDuration(enteredGroupAt: string | undefined): string | null {
  if (!enteredGroupAt) return null;
  const entered = new Date(enteredGroupAt).getTime();
  if (isNaN(entered)) return null;

  const days = Math.floor((Date.now() - entered) / 86400000);

  if (days < 1) return "new today";
  if (days < 30) return `in group ${days}d`;
  return `in group ${Math.floor(days / 30)}mo`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/timeline.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/timeline.ts src/lib/timeline.test.ts
git commit -m "feat: add timeline duration formatting with tests"
```

---

## Task 5: Compute enteredGroupAt Server-Side

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/app/api/attention/route.ts`

- [ ] **Step 1: Add enteredGroupAt to AttentionCompany type**

In `src/lib/types.ts`, add `enteredGroupAt?: string` to `AttentionCompany` interface (after `daysSilent`).

- [ ] **Step 2: Compute enteredGroupAt in the API route**

Modify `src/app/api/attention/route.ts`:
- After fetching the 4 signal groups, iterate through each group's companies and compute `enteredGroupAt`:

```typescript
function computeEnteredGroupAt(company: AttentionCompany, signal: string): string | undefined {
  const now = Date.now();
  if (signal === "overdue_tasks" && company.daysOverdue !== undefined) {
    return new Date(now - company.daysOverdue * 86400000).toISOString();
  }
  if (signal === "overdue_invoices" && company.daysOverdue !== undefined) {
    return new Date(now - company.daysOverdue * 86400000).toISOString();
  }
  if (signal === "health_score" && company.categoryChangedAt) {
    return company.categoryChangedAt;
  }
  if (signal === "gone_quiet" && company.daysSilent !== undefined) {
    return new Date(now - company.daysSilent * 86400000).toISOString();
  }
  return undefined;
}
```

- Apply after groups are constructed. The route currently builds groups with signal labels, so iterate through each group and enrich its companies:

```typescript
// After constructing the groups array
const enrichedGroups = groups.map((group) => ({
  ...group,
  companies: group.companies.map((company) => ({
    ...company,
    enteredGroupAt: computeEnteredGroupAt(company, group.signal),
  })),
}));
```

Use `enrichedGroups` instead of `groups` in the response.

**Note on overdue invoices:** The `fetchOverdueInvoices` function does NOT currently populate `daysOverdue` on the returned companies. The `computeEnteredGroupAt` will return `undefined` for overdue invoices since there's no date field available to compute duration from the current HubSpot query. This is acceptable per spec ("If the server cannot compute a reliable timestamp, omit the field"). Timeline labels will simply not appear for overdue invoice items.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts src/app/api/attention/route.ts
git commit -m "feat: compute enteredGroupAt for timeline context"
```

---

## Task 6: Timeline Display in AttentionGroup

**Files:**
- Modify: `src/components/AttentionGroup.tsx`

- [ ] **Step 1: Add timeline label to CompanyRow**

Modify `AttentionGroup.tsx`:
- Import `formatGroupDuration` from `@/lib/timeline`
- In `CompanyRow`, after the existing detail/urgency elements, add:

```tsx
{(() => {
  const duration = formatGroupDuration(company.enteredGroupAt);
  if (!duration) return null;
  return (
    <span className="text-[11px] text-[var(--green-100)]/60 border-l border-[var(--beige-gray)] pl-2 ml-1">
      {duration}
    </span>
  );
})()}
```

Add this inside the detail row div (the flex container with gap-2 that holds signal-specific info), for all signal types.

- [ ] **Step 2: Verify in browser**

Check: Attention list items should show "in group Xd" or "new today" labels.

- [ ] **Step 3: Commit**

```bash
git add src/components/AttentionGroup.tsx
git commit -m "feat: show timeline duration on attention items"
```

---

## Task 7: Snooze Logic

**Files:**
- Create: `src/lib/snooze.ts`
- Create: `src/lib/snooze.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/snooze.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSnoozedCompanies,
  snoozeCompany,
  unsnoozeCompany,
  isCompanySnoozed,
} from "./snooze";

describe("snooze", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when no data stored", () => {
    expect(getSnoozedCompanies()).toEqual([]);
  });

  it("snoozes a company", () => {
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-04-01T00:00:00Z",
      companyName: "Test Co",
    });
    expect(getSnoozedCompanies()).toHaveLength(1);
    expect(isCompanySnoozed("1", "overdue_invoices")).toBe(true);
  });

  it("does not report snoozed for different signal", () => {
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-04-01T00:00:00Z",
      companyName: "Test Co",
    });
    expect(isCompanySnoozed("1", "gone_quiet")).toBe(false);
  });

  it("updates existing snooze for same company+signal", () => {
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-04-01T00:00:00Z",
      companyName: "Test Co",
    });
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-05-01T00:00:00Z",
      companyName: "Test Co",
    });
    const snoozed = getSnoozedCompanies();
    expect(snoozed).toHaveLength(1);
    expect(snoozed[0].snoozeUntil).toBe("2026-05-01T00:00:00Z");
  });

  it("unsnoozes a company", () => {
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-04-01T00:00:00Z",
      companyName: "Test Co",
    });
    unsnoozeCompany("1", "overdue_invoices");
    expect(isCompanySnoozed("1", "overdue_invoices")).toBe(false);
  });

  it("auto-cleans expired entries on read", () => {
    // Manually write an expired entry
    localStorage.setItem(
      "snoozed-companies",
      JSON.stringify([
        { companyId: "1", signal: "overdue_invoices", snoozeUntil: "2020-01-01T00:00:00Z", companyName: "Old" },
        { companyId: "2", signal: "gone_quiet", snoozeUntil: "2099-01-01T00:00:00Z", companyName: "Future" },
      ])
    );
    const result = getSnoozedCompanies();
    expect(result).toHaveLength(1);
    expect(result[0].companyId).toBe("2");
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("snoozed-companies", "not-json");
    expect(getSnoozedCompanies()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/snooze.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement snooze logic**

```typescript
// src/lib/snooze.ts
import type { AttentionSignal } from "./types";

const STORAGE_KEY = "snoozed-companies";

export interface SnoozedCompany {
  companyId: string;
  signal: AttentionSignal;
  snoozeUntil: string;
  companyName: string;
}

export function getSnoozedCompanies(): SnoozedCompany[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Auto-clean expired
    const now = new Date().toISOString();
    const active = parsed.filter(
      (s: SnoozedCompany) => s.snoozeUntil > now
    );
    // Write back cleaned list if any were removed
    if (active.length !== parsed.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    }
    return active;
  } catch {
    return [];
  }
}

export function snoozeCompany(entry: SnoozedCompany): void {
  const current = getSnoozedCompanies().filter(
    (s) => !(s.companyId === entry.companyId && s.signal === entry.signal)
  );
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([...current, entry])
  );
}

export function unsnoozeCompany(companyId: string, signal: AttentionSignal): void {
  const updated = getSnoozedCompanies().filter(
    (s) => !(s.companyId === companyId && s.signal === signal)
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function isCompanySnoozed(companyId: string, signal: AttentionSignal): boolean {
  return getSnoozedCompanies().some(
    (s) => s.companyId === companyId && s.signal === signal
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/snooze.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/snooze.ts src/lib/snooze.test.ts
git commit -m "feat: add snooze localStorage logic with tests"
```

---

## Task 8: SnoozePopover Component

**Files:**
- Create: `src/components/SnoozePopover.tsx`

- [ ] **Step 1: Create SnoozePopover component**

```tsx
// src/components/SnoozePopover.tsx
"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  isOpen: boolean;
  onSnooze: (until: string) => void;
  onClose: () => void;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default function SnoozePopover({ isOpen, onSnooze, onClose }: Props) {
  const [customDate, setCustomDate] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const presets = [
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "1 month", days: 30 },
  ];

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-52 z-50"
    >
      <div className="text-xs font-semibold text-[var(--moss)] mb-2">
        Snooze this company
      </div>
      <div className="flex flex-col gap-0.5">
        {presets.map((p) => (
          <button
            key={p.days}
            onClick={() => onSnooze(addDays(p.days))}
            className="text-left px-2.5 py-1.5 rounded-md text-sm text-gray-600 hover:bg-[var(--light-grey)] transition-all duration-200"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="border-t border-gray-100 my-2" />
      <div className="flex items-center gap-2 px-2.5">
        <span className="text-sm text-gray-600">Until:</span>
        <input
          type="date"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          onBlur={() => {
            if (customDate) {
              onSnooze(new Date(customDate + "T23:59:59").toISOString());
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customDate) {
              onSnooze(new Date(customDate + "T23:59:59").toISOString());
            }
          }}
          min={new Date().toISOString().split("T")[0]}
          className="text-xs border border-gray-200 rounded px-1.5 py-1 text-gray-600 flex-1"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SnoozePopover.tsx
git commit -m "feat: add snooze popover component"
```

---

## Task 9: Integrate Snooze into AttentionGroup

**Files:**
- Modify: `src/components/AttentionGroup.tsx`
- Modify: `src/components/AttentionList.tsx`

- [ ] **Step 1: Add snooze icon and popover to CompanyRow**

Modify `AttentionGroup.tsx`:
- Import `snoozeCompany, unsnoozeCompany, getSnoozedCompanies, isCompanySnoozed, SnoozedCompany` from `@/lib/snooze`
- Import `SnoozePopover` from `./SnoozePopover`
- Add state to `AttentionGroup`: `snoozedIds` set (recalculated from `getSnoozedCompanies()` on mount and after snooze/unsnooze actions), `showSnoozed` boolean (false by default), `snoozePopoverCompanyId` (string | null, tracks which company's popover is open)
- Split `group.companies` into `activeCompanies` (not snoozed) and `snoozedCompanies` (snoozed for this signal)
- Sort and slice `activeCompanies` as before
- Update the group count badge to show `activeCompanies.length` instead of `group.companies.length`
- In `CompanyRow`: add a snooze bell icon button on the right side (before MRR), visible on hover (`opacity-0 group-hover:opacity-100`). Add `group` class to the company row container for hover detection.
- When bell is clicked (stop propagation so row click doesn't fire): set `snoozePopoverCompanyId` to this company's ID
- Render `SnoozePopover` when `snoozePopoverCompanyId === company.id`:
  - `onSnooze`: call `snoozeCompany({ companyId, signal: group.signal, snoozeUntil, companyName })`, refresh snoozedIds, close popover
  - `onClose`: set `snoozePopoverCompanyId` to null
- After the active companies list, if `snoozedCompanies.length > 0`:
  - Show toggle button: "Show snoozed (N)" / "Hide snoozed"
  - When expanded, render snoozed items dimmed (opacity-50) with "Snoozed until [date]" text and an "Unsnooze" button

- [ ] **Step 2: Exclude snoozed from AttentionList summary counts**

Modify `AttentionList.tsx`:
- Import `getSnoozedCompanies` from `@/lib/snooze`
- Add state: `snoozedList` loaded from `getSnoozedCompanies()` on mount
- When computing `filteredGroups`, also filter out snoozed companies from each group's companies array for count purposes
- The summary grid uses the filtered (non-snoozed) counts
- Pass a callback to `AttentionGroup` to refresh snoozed state after snooze/unsnooze (or use a simple key-based re-render)

Actually simpler: `AttentionGroup` manages its own snooze state. `AttentionList` just needs to know how many are snoozed to adjust summary counts. Since snooze state is in localStorage, both can read independently. Add a `snoozedList` state to `AttentionList` and recompute counts. Trigger refresh via a `onSnoozeChange` callback prop on `AttentionGroup` that tells `AttentionList` to re-read localStorage.

**"My accounts" filter interaction:** The owner filter in `AttentionList` filters companies by `ownerId` before passing groups to `AttentionGroup`. This means snoozed items from other owners are already excluded from the filtered groups. The "Show snoozed" toggle inside `AttentionGroup` only sees companies that passed the owner filter, so it naturally only shows the current user's snoozed items when "My accounts" is active. No additional logic needed for this.

- [ ] **Step 3: Verify in browser**

Check:
- Hover a company row: bell icon appears
- Click bell: snooze popover opens
- Click "1 week": company disappears from active list
- "Show snoozed (1)" appears at bottom of group
- Click to expand: snoozed company visible dimmed with "Unsnooze" button
- Summary counts update to exclude snoozed

- [ ] **Step 4: Commit**

```bash
git add src/components/AttentionGroup.tsx src/components/AttentionList.tsx
git commit -m "feat: integrate snooze into attention dashboard"
```

---

## Task 10: Update Preview Page

**Files:**
- Modify: `src/app/preview/page.tsx`

- [ ] **Step 1: Add health badge test data and enteredGroupAt to mock**

- Update `MOCK_DATA.company` to have `"Health Score Category": "Monitor"` (was "Good") and add mock `previousCategory` to test trend
- Add `enteredGroupAt` values to `MOCK_ATTENTION` companies
- Pass `previousCategory` and `categoryChangedAt` to `CompanyHeader` in preview for testing
- Ensure snooze works in preview (it uses localStorage, should work automatically)

- [ ] **Step 2: Commit**

```bash
git add src/app/preview/page.tsx
git commit -m "feat: update preview page with batch 2 test data"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Full manual verification on /preview**

1. Health badge visible on company header with correct color
2. Timeline "in group Xd" labels on attention items
3. Snooze: hover shows bell, popover works, company hides, unsnooze works
4. Summary counts update when snoozing
5. All keyboard shortcuts still work
