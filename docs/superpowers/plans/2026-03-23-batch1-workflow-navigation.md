# Batch 1: Workflow & Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard faster to navigate with sorting, recent companies, back navigation, keyboard shortcuts, and activity filters.

**Architecture:** All features are client-side only - no API changes. Sort logic, recent companies (localStorage), keyboard shortcuts (global listener hook), and activity filters (component state) are independent units that integrate into existing components. Back navigation adds a `navigationSource` state to the main page.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-03-23-batch1-workflow-navigation-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/lib/sort-attention.ts` | Pure sort functions for attention companies (by MRR, days overdue, days silent) |
| `src/lib/sort-attention.test.ts` | Tests for sort logic |
| `src/lib/recent-companies.ts` | localStorage read/write for recent companies list |
| `src/lib/recent-companies.test.ts` | Tests for recent companies logic |
| `src/lib/filter-activities.ts` | Pure filter functions for engagements (by type, by date range) |
| `src/lib/filter-activities.test.ts` | Tests for activity filter logic |
| `src/hooks/useKeyboardShortcuts.ts` | Global keyboard listener hook |
| `src/components/ActivityFilters.tsx` | Type toggle pills + date range preset buttons |
| `src/components/ShortcutCheatSheet.tsx` | Modal overlay showing keyboard shortcuts |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/AttentionGroup.tsx` | Add sort toggle UI, apply sort to companies list |
| `src/components/SearchBar.tsx` | Add recent companies dropdown on focus, Cmd+K badge, clear-on-focus logic |
| `src/components/CompanyHeader.tsx` | Add "use client", add back arrow button (receives `onBack` and `showBack` props) |
| `src/components/ActivityTab.tsx` | Integrate ActivityFilters, apply filter logic to engagements |
| `src/app/page.tsx` | Add `navigationSource` state, scroll save/restore, wire keyboard shortcuts, pass new props |

---

## Task 1: Attention Group Sorting Logic

**Files:**
- Create: `src/lib/sort-attention.ts`
- Create: `src/lib/sort-attention.test.ts`

- [ ] **Step 1: Write failing tests for sort functions**

```typescript
// src/lib/sort-attention.test.ts
import { describe, it, expect } from "vitest";
import { sortAttentionCompanies } from "./sort-attention";
import type { AttentionCompany } from "./types";

const makeCompany = (
  overrides: Partial<AttentionCompany>
): AttentionCompany => ({
  id: "1",
  name: "Test Co",
  detail: "",
  ownerId: "owner1",
  mrr: "0",
  currency: "EUR",
  daysOverdue: 0,
  daysSilent: 0,
  ...overrides,
});

describe("sortAttentionCompanies", () => {
  it("sorts by MRR descending by default", () => {
    const companies = [
      makeCompany({ id: "a", name: "Low", mrr: "500" }),
      makeCompany({ id: "b", name: "High", mrr: "2000" }),
      makeCompany({ id: "c", name: "Mid", mrr: "1200" }),
    ];
    const sorted = sortAttentionCompanies(companies, "mrr");
    expect(sorted.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by daysOverdue descending", () => {
    const companies = [
      makeCompany({ id: "a", name: "A", daysOverdue: 5 }),
      makeCompany({ id: "b", name: "B", daysOverdue: 30 }),
      makeCompany({ id: "c", name: "C", daysOverdue: 12 }),
    ];
    const sorted = sortAttentionCompanies(companies, "daysOverdue");
    expect(sorted.map((c) => c.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by daysSilent descending", () => {
    const companies = [
      makeCompany({ id: "a", name: "A", daysSilent: 10 }),
      makeCompany({ id: "b", name: "B", daysSilent: 45 }),
    ];
    const sorted = sortAttentionCompanies(companies, "daysSilent");
    expect(sorted.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("breaks ties alphabetically by name", () => {
    const companies = [
      makeCompany({ id: "a", name: "Zebra Tours", mrr: "1000" }),
      makeCompany({ id: "b", name: "Alpha Workshops", mrr: "1000" }),
    ];
    const sorted = sortAttentionCompanies(companies, "mrr");
    expect(sorted.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("handles MRR with currency formatting", () => {
    const companies = [
      makeCompany({ id: "a", name: "A", mrr: "1 500" }),
      makeCompany({ id: "b", name: "B", mrr: "800" }),
    ];
    const sorted = sortAttentionCompanies(companies, "mrr");
    expect(sorted.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("returns empty array for empty input", () => {
    expect(sortAttentionCompanies([], "mrr")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sort-attention.test.ts`
Expected: FAIL - cannot find module `./sort-attention`

- [ ] **Step 3: Implement sort function**

```typescript
// src/lib/sort-attention.ts
import type { AttentionCompany } from "./types";

export type SortField = "mrr" | "daysOverdue" | "daysSilent";

function parseMrr(value: string | undefined): number {
  if (!value) return 0;
  // Strip non-numeric characters except dots (handles "1 500", "$1,500", etc.)
  const cleaned = value.replace(/[^\d.]/g, "");
  return parseFloat(cleaned) || 0;
}

function getSortValue(company: AttentionCompany, field: SortField): number {
  if (field === "mrr") return parseMrr(company.mrr);
  return (company[field] as number) ?? 0;
}

export function sortAttentionCompanies(
  companies: AttentionCompany[],
  field: SortField
): AttentionCompany[] {
  return [...companies].sort((a, b) => {
    const diff = getSortValue(b, field) - getSortValue(a, field);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/sort-attention.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sort-attention.ts src/lib/sort-attention.test.ts
git commit -m "feat: add attention company sort logic with tests"
```

---

## Task 2: Attention Group Sort UI

**Files:**
- Modify: `src/components/AttentionGroup.tsx`

- [ ] **Step 1: Add sort state and toggle UI to AttentionGroup**

In `AttentionGroup.tsx`, add:
- Import `sortAttentionCompanies` and `SortField` from `@/lib/sort-attention`
- Add `sortField` state (default: `"mrr"`)
- Determine the secondary sort label and field based on `group.signal`:
  - `"overdue_invoices"` / `"overdue_tasks"` -> secondary field `"daysOverdue"`, label `"Days overdue"`
  - `"gone_quiet"` -> secondary field `"daysSilent"`, label `"Days silent"`
  - `"health_score"` -> no secondary sort (no toggle rendered)
- Sort `group.companies` through `sortAttentionCompanies(group.companies, sortField)` BEFORE the `slice(0, displayCount)` that handles expand/collapse. The sorted array feeds into the slice, so only the top-N sorted companies are shown when collapsed.
- Render sort toggle buttons in the group header row, right-aligned:
  - Two buttons: "MRR" (active when sortField is "mrr") and the secondary label
  - Active style: `bg-[var(--moss)] text-white`, inactive: `border border-gray-300 text-gray-500`
  - Prefixed with "Sort:" in muted text
  - Only render toggle when signal is NOT `"health_score"`

- [ ] **Step 2: Verify in browser**

Run: `npm run dev`
Check: Attention groups show sort toggle. Clicking toggles reorder the list. Health Score group has no toggle.

- [ ] **Step 3: Commit**

```bash
git add src/components/AttentionGroup.tsx
git commit -m "feat: add sort toggle to attention groups"
```

---

## Task 3: Recent Companies Logic

**Files:**
- Create: `src/lib/recent-companies.ts`
- Create: `src/lib/recent-companies.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/recent-companies.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getRecentCompanies,
  addRecentCompany,
  removeRecentCompany,
} from "./recent-companies";

const STORAGE_KEY = "recent-companies";

describe("recent companies", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when no data stored", () => {
    expect(getRecentCompanies()).toEqual([]);
  });

  it("adds a company to recents", () => {
    addRecentCompany({ id: "1", name: "Alpha Co" });
    expect(getRecentCompanies()).toEqual([{ id: "1", name: "Alpha Co" }]);
  });

  it("moves duplicate to front instead of adding again", () => {
    addRecentCompany({ id: "1", name: "Alpha" });
    addRecentCompany({ id: "2", name: "Beta" });
    addRecentCompany({ id: "1", name: "Alpha" });
    const recents = getRecentCompanies();
    expect(recents).toHaveLength(2);
    expect(recents[0].id).toBe("1");
  });

  it("keeps max 5 entries", () => {
    for (let i = 1; i <= 7; i++) {
      addRecentCompany({ id: String(i), name: `Company ${i}` });
    }
    const recents = getRecentCompanies();
    expect(recents).toHaveLength(5);
    expect(recents[0].id).toBe("7");
    expect(recents[4].id).toBe("3");
  });

  it("removes a company by id", () => {
    addRecentCompany({ id: "1", name: "Alpha" });
    addRecentCompany({ id: "2", name: "Beta" });
    removeRecentCompany("1");
    expect(getRecentCompanies()).toEqual([{ id: "2", name: "Beta" }]);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(getRecentCompanies()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/recent-companies.test.ts`
Expected: FAIL - cannot find module

- [ ] **Step 3: Implement recent companies logic**

```typescript
// src/lib/recent-companies.ts
const STORAGE_KEY = "recent-companies";
const MAX_RECENTS = 5;

export interface RecentCompany {
  id: string;
  name: string;
}

export function getRecentCompanies(): RecentCompany[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function addRecentCompany(company: RecentCompany): void {
  const current = getRecentCompanies().filter((c) => c.id !== company.id);
  const updated = [{ id: company.id, name: company.name }, ...current].slice(
    0,
    MAX_RECENTS
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function removeRecentCompany(id: string): void {
  const updated = getRecentCompanies().filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/recent-companies.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/recent-companies.ts src/lib/recent-companies.test.ts
git commit -m "feat: add recent companies localStorage logic with tests"
```

---

## Task 4: SearchBar - Recent Companies Dropdown

**Files:**
- Modify: `src/components/SearchBar.tsx`

- [ ] **Step 1: Add recent companies to SearchBar**

Modify `SearchBar.tsx`:
- Import `getRecentCompanies, addRecentCompany, removeRecentCompany, RecentCompany` from `@/lib/recent-companies`
- Add state: `recents` as `RecentCompany[]`, initialized to `[]`
- On mount (`useEffect`), load recents from localStorage: `setRecents(getRecentCompanies())`
- Do NOT call `addRecentCompany` in SearchBar - that happens in `page.tsx` after a successful API fetch (per spec: "updated whenever a company detail view loads successfully")
- Add `handleFocus` handler on the input: if query is empty, open dropdown showing recents
- Add a `clearAndFocus` method exposed via a forwarded ref (or just clear query on Cmd+K - handled in Task 9)
- **Important:** The existing `useEffect` on `query` sets `setIsOpen(false)` when `query.length < 2`. This will close the recents dropdown immediately on focus with empty query. Fix: add a separate `showRecents` state that is set to `true` on focus when query is empty, and used alongside `isOpen` to control dropdown visibility. The recents section renders when `showRecents && query === ""`. The API results section renders when `isOpen && results.length > 0`. Both share the same dropdown container.
- When `isOpen` is true and `query` is empty, render recents section:
  - "Recent" header label (11px uppercase, muted)
  - List of recent companies with clock icon prefix
  - Each clickable, calling `handleSelect` with `{ id, name, domain: "" }` as CompanySearchResult
- When `isOpen` is true and `query` is not empty, show matching recents above a divider, then API results below:
  - Filter recents by `name.toLowerCase().includes(query.toLowerCase())`
  - Only show divider if both sections have results
- Add Cmd+K hint badge inside the search input, right-aligned:
  - Small gray badge showing platform-appropriate shortcut text
  - Hidden when input is focused or has text
  - Use `navigator.platform` to detect Mac vs other

- [ ] **Step 2: Handle stale entries**

In `handleSelect` for recent companies: if the API fetch in `page.tsx` returns an error for a recent company, call `removeRecentCompany(id)` and update state. This is handled by `page.tsx` passing an error callback - add an optional `onSelectError?: (id: string) => void` prop. But simpler: `page.tsx` already sets an error state. The SearchBar doesn't need to know about this. Instead, handle it in `page.tsx` Task 7: if fetch fails for a company, call `removeRecentCompany(id)`.

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
Check:
- Click search bar with empty query -> shows "Recent" section (empty if no history)
- Select a company, click back, focus search again -> company appears in recents
- Type partial name -> matching recents appear above divider, API results below
- Cmd+K badge visible when search is unfocused

- [ ] **Step 4: Commit**

```bash
git add src/components/SearchBar.tsx
git commit -m "feat: add recent companies dropdown to search bar"
```

---

## Task 5: Back Navigation

**Files:**
- Modify: `src/components/CompanyHeader.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add back arrow to CompanyHeader**

Modify `CompanyHeader.tsx`:
- Add `"use client"` directive at top (needed for onClick handler)
- Add props: `onBack?: () => void`, `showBack?: boolean`
- When `showBack` is true, render a back arrow button before the company name:
  - 32x32px, `rounded-[8px] border border-gray-200 bg-white hover:bg-[#F8F6ED]`
  - Left arrow character `←` or SVG, color `var(--moss)`
  - `onClick={onBack}`
- Wrap company name area in a flex row with the back button

- [ ] **Step 2: Add navigationSource state to page.tsx**

Modify `page.tsx`:
- Add state: `navigationSource` as `"attention" | "search" | null`, default `null`
- Add ref: `scrollPositionRef` as `useRef<number>(0)`
- When `AttentionList` `onSelectCompany` fires: set `navigationSource` to `"attention"`, save `window.scrollY` to `scrollPositionRef`
- When `SearchBar` `onSelect` fires: set `navigationSource` to `"search"`
- Create separate handler functions:
  - `handleAttentionSelect(company)`: saves scroll, sets source to "attention", calls shared fetch logic
  - `handleSearchSelect(company)`: sets source to "search", calls shared fetch logic
- Remove existing "Back to overview" button (lines ~107-115 in current page.tsx)
- Pass `showBack={navigationSource === "attention"}` and `onBack={handleBack}` to `CompanyHeader`
- In `handleBack`: clear company data, set `navigationSource` to `null`, restore scroll in a `requestAnimationFrame`:
  ```typescript
  const pos = scrollPositionRef.current;
  requestAnimationFrame(() => window.scrollTo(0, pos));
  ```
- After successful company fetch: call `addRecentCompany({ id: company.id, name: company.name })` to update recents (this is the correct place per spec: "updated whenever a company detail view loads successfully")
- Handle stale recent companies: if fetch fails, call `removeRecentCompany(id)` from the error handler

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
Check:
- Click company from attention list -> back arrow visible -> click returns to list at same scroll position
- Search for company -> no back arrow shown
- Browser back button works

- [ ] **Step 4: Commit**

```bash
git add src/components/CompanyHeader.tsx src/app/page.tsx
git commit -m "feat: add back navigation with scroll restoration"
```

---

## Task 6: Activity Filter Logic

**Files:**
- Create: `src/lib/filter-activities.ts`
- Create: `src/lib/filter-activities.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/filter-activities.test.ts
import { describe, it, expect } from "vitest";
import { filterEngagements } from "./filter-activities";
import type { Engagement } from "./types";

const makeEngagement = (
  overrides: Partial<Engagement>
): Engagement => ({
  type: "note",
  title: "Test",
  body: "",
  bodyPreview: "",
  summary: "",
  timestamp: String(Date.now()),
  ...overrides,
});

const now = Date.now();
const daysAgo = (d: number) => String(now - d * 86400000);

describe("filterEngagements", () => {
  const engagements = [
    makeEngagement({ type: "call", timestamp: daysAgo(5) }),
    makeEngagement({ type: "email", timestamp: daysAgo(15) }),
    makeEngagement({ type: "meeting", timestamp: daysAgo(35) }),
    makeEngagement({ type: "note", timestamp: daysAgo(65) }),
  ];

  it("returns all when no filters applied", () => {
    const result = filterEngagements(engagements, { types: null, daysBack: 90 });
    expect(result).toHaveLength(4);
  });

  it("filters by single type", () => {
    const result = filterEngagements(engagements, { types: ["call"], daysBack: 90 });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("call");
  });

  it("filters by multiple types", () => {
    const result = filterEngagements(engagements, { types: ["call", "email"], daysBack: 90 });
    expect(result).toHaveLength(2);
  });

  it("filters by date range", () => {
    const result = filterEngagements(engagements, { types: null, daysBack: 30 });
    expect(result).toHaveLength(2);
  });

  it("combines type and date filters", () => {
    const result = filterEngagements(engagements, { types: ["call", "meeting"], daysBack: 30 });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("call");
  });

  it("handles ISO date string timestamps", () => {
    const isoEngagement = makeEngagement({
      type: "call",
      timestamp: new Date(now - 10 * 86400000).toISOString(),
    });
    const result = filterEngagements([isoEngagement], { types: null, daysBack: 30 });
    expect(result).toHaveLength(1);
  });

  it("returns empty for no matches", () => {
    const result = filterEngagements(engagements, { types: ["call"], daysBack: 3 });
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/filter-activities.test.ts`
Expected: FAIL - cannot find module

- [ ] **Step 3: Implement filter function**

```typescript
// src/lib/filter-activities.ts
import type { Engagement } from "./types";

export interface ActivityFilterState {
  types: string[] | null; // null means all types
  daysBack: number;
}

function parseTimestamp(ts: string): number {
  const asInt = parseInt(ts);
  if (!isNaN(asInt) && String(asInt) === ts) return asInt;
  return new Date(ts).getTime();
}

export function filterEngagements(
  engagements: Engagement[],
  filters: ActivityFilterState
): Engagement[] {
  const cutoff = Date.now() - filters.daysBack * 86400000;

  return engagements.filter((e) => {
    if (filters.types && !filters.types.includes(e.type)) return false;
    const ts = parseTimestamp(e.timestamp);
    if (ts < cutoff) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/filter-activities.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/filter-activities.ts src/lib/filter-activities.test.ts
git commit -m "feat: add activity filter logic with tests"
```

---

## Task 7: Activity Filters UI

**Files:**
- Create: `src/components/ActivityFilters.tsx`
- Modify: `src/components/ActivityTab.tsx`

- [ ] **Step 1: Create ActivityFilters component**

```tsx
// src/components/ActivityFilters.tsx
"use client";

import { useState } from "react";

const TYPES = ["call", "meeting", "note", "email"] as const;
const TYPE_LABELS: Record<string, string> = {
  call: "Calls",
  meeting: "Meetings",
  note: "Notes",
  email: "Emails",
};
const DATE_PRESETS = [7, 30, 60, 90] as const;

interface Props {
  onFilterChange: (filters: { types: string[] | null; daysBack: number }) => void;
}

export default function ActivityFilters({ onFilterChange }: Props) {
  const [activeTypes, setActiveTypes] = useState<string[] | null>(null); // null = all
  const [daysBack, setDaysBack] = useState(90);

  function handleTypeClick(type: string) {
    let next: string[] | null;
    if (activeTypes === null) {
      // "All" was active, switch to just this type
      next = [type];
    } else if (activeTypes.includes(type)) {
      // Toggle off
      const filtered = activeTypes.filter((t) => t !== type);
      next = filtered.length === 0 ? null : filtered;
    } else {
      // Toggle on
      const added = [...activeTypes, type];
      next = added.length === TYPES.length ? null : added;
    }
    setActiveTypes(next);
    onFilterChange({ types: next, daysBack });
  }

  function handleAllClick() {
    setActiveTypes(null);
    onFilterChange({ types: null, daysBack });
  }

  function handleDaysClick(days: number) {
    setDaysBack(days);
    onFilterChange({ types: activeTypes, daysBack: days });
  }

  const pillBase = "px-3 py-1 rounded-2xl text-xs font-medium cursor-pointer transition-colors";
  const pillActive = `${pillBase} bg-[var(--moss)] text-white`;
  const pillInactive = `${pillBase} border border-gray-300 text-gray-500 hover:border-gray-400`;

  return (
    <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
      <div className="flex gap-1.5 flex-wrap">
        <button
          className={activeTypes === null ? pillActive : pillInactive}
          onClick={handleAllClick}
        >
          All
        </button>
        {TYPES.map((type) => (
          <button
            key={type}
            className={
              activeTypes?.includes(type) ? pillActive : pillInactive
            }
            onClick={() => handleTypeClick(type)}
          >
            {TYPE_LABELS[type]}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        {DATE_PRESETS.map((days) => (
          <button
            key={days}
            className={daysBack === days ? pillActive : pillInactive}
            onClick={() => handleDaysClick(days)}
          >
            {days}d
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate filters into ActivityTab**

Modify `ActivityTab.tsx`:
- Import `ActivityFilters` from `./ActivityFilters`
- Import `filterEngagements, ActivityFilterState` from `@/lib/filter-activities`
- Add state: `filters` as `ActivityFilterState`, default `{ types: null, daysBack: 90 }`
- Compute `filteredEngagements = filterEngagements(engagements, filters)`
- Render `<ActivityFilters onFilterChange={setFilters} />` above the activity list
- Replace `engagements` with `filteredEngagements` in the map
- Add a count line below filters: "Showing X activities" (or descriptive empty state when 0)
- Empty state when no matches: centered muted text "No activities match the current filters"

- [ ] **Step 3: Verify in browser**

Run: `npm run dev`
Check:
- Type pills toggle correctly (All active by default, clicking type deactivates All)
- Date range switches between 7d/30d/60d/90d
- Activity list updates immediately
- Count reflects filtered results
- Empty state shows when no matches

- [ ] **Step 4: Commit**

```bash
git add src/components/ActivityFilters.tsx src/components/ActivityTab.tsx
git commit -m "feat: add activity type and date range filters"
```

---

## Task 8: Keyboard Shortcuts Hook

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`
- Create: `src/components/ShortcutCheatSheet.tsx`

- [ ] **Step 1: Create the keyboard shortcuts hook**

```typescript
// src/hooks/useKeyboardShortcuts.ts
"use client";

import { useEffect, useCallback } from "react";

const isMac =
  typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export interface ShortcutActions {
  onSearch: () => void;         // Cmd+K / Ctrl+K
  onBack: () => void;           // Esc
  onNavigate: (direction: "up" | "down") => void;  // Arrow keys
  onSelect: () => void;         // Enter
  onJumpToGroup: (index: number) => void;  // 1-4
  onToggleHelp: () => void;     // ?
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd+K / Ctrl+K: always works, even in inputs
      if (modKey && e.key === "k") {
        e.preventDefault();
        actions.onSearch();
        return;
      }

      // Esc: priority chain - let focused inputs handle it first (e.g. SearchBar
      // closing its dropdown), then close modals, then blur inputs, then go back.
      // If an input is focused, don't call onBack - the input's own Escape handler
      // takes priority (e.g. SearchBar closes dropdown). Only act on Escape when
      // no input is focused, or when the cheat sheet modal is open.
      if (e.key === "Escape") {
        if (isInputFocused()) {
          // Let the component's own handler deal with it (SearchBar closes dropdown).
          // Don't call onBack which would also navigate away.
          return;
        }
        actions.onBack();
        return;
      }

      // All remaining shortcuts are suppressed when input is focused
      if (isInputFocused()) return;

      // Arrow navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        actions.onNavigate("down");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        actions.onNavigate("up");
        return;
      }

      // Enter to open
      if (e.key === "Enter") {
        actions.onSelect();
        return;
      }

      // Number keys 1-4 to jump to group
      const num = parseInt(e.key);
      if (num >= 1 && num <= 4) {
        actions.onJumpToGroup(num - 1); // 0-indexed
        return;
      }

      // ? for help
      if (e.key === "?") {
        actions.onToggleHelp();
        return;
      }
    },
    [actions]
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);
}

export { isMac };
```

- [ ] **Step 2: Create ShortcutCheatSheet component**

```tsx
// src/components/ShortcutCheatSheet.tsx
"use client";

import { isMac } from "@/hooks/useKeyboardShortcuts";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const modLabel = isMac ? "Cmd" : "Ctrl";

const shortcuts = [
  { label: "Focus search", keys: `${modLabel} + K` },
  { label: "Go back", keys: "Esc" },
  { label: "Navigate list", keys: "Arrow Up / Down" },
  { label: "Open company", keys: "Enter" },
  { label: "Jump to group", keys: "1 - 4" },
  { label: "Show this help", keys: "?" },
];

export default function ShortcutCheatSheet({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative bg-white rounded-2xl shadow-lg p-6 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-[var(--moss)] mb-4">
          Keyboard Shortcuts
        </h3>
        <div className="flex flex-col gap-3">
          {shortcuts.map((s) => (
            <div key={s.label} className="flex justify-between items-center">
              <span className="text-sm text-gray-600">{s.label}</span>
              <kbd className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify components render**

Run: `npm run dev`
Check: No errors. Components created but not yet wired into page (that happens in Task 9).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts src/components/ShortcutCheatSheet.tsx
git commit -m "feat: add keyboard shortcuts hook and cheat sheet component"
```

---

## Task 9: Wire Everything Into Main Page

**Files:**
- Modify: `src/app/page.tsx`

This task integrates all the pieces from previous tasks. Some of these were partially done in Task 5 (back nav). This task adds: keyboard shortcuts wiring, search bar ref for Cmd+K, attention list focus tracking.

- [ ] **Step 1: Add keyboard shortcuts and focus management to page.tsx**

Modify `page.tsx`:
- Import `useKeyboardShortcuts` from `@/hooks/useKeyboardShortcuts`
- Import `ShortcutCheatSheet` from `@/components/ShortcutCheatSheet`
- Import `removeRecentCompany` from `@/lib/recent-companies`
- Add state: `showHelp` as boolean, default `false`
- Add state: `focusedAttentionIndex` as number, default `-1`. This is a flat index across all visible companies in all groups. To map it to a specific company: flatten all visible groups' companies into a single array (respecting expand/collapse state), then index into that array. The flattening happens in a `useMemo` that produces `flatCompanies: AttentionCompany[]` from the current attention data.
- Add ref: `searchInputRef` as `useRef<HTMLInputElement>(null)`
- Pass `ref={searchInputRef}` to SearchBar (SearchBar needs to forward ref to its input - update SearchBar to use `forwardRef`)
- Wire `useKeyboardShortcuts`:
  - `onSearch`: clear search query (set via ref), focus search input via ref
  - `onBack`: if `showHelp` is open, close it. If search is focused, blur it. If company is selected and source is "attention", call handleBack.
  - `onNavigate`: increment/decrement `focusedAttentionIndex` (clamped to valid range)
  - `onSelect`: if `focusedAttentionIndex >= 0`, select that company from the attention data
  - `onJumpToGroup`: if index is within the number of visible groups, scroll to that group's DOM element (use `data-attention-group` attribute), set `focusedAttentionIndex` to first item in that group. If index exceeds visible group count, no-op.
  - `onToggleHelp`: toggle `showHelp`
- Render `<ShortcutCheatSheet isOpen={showHelp} onClose={() => setShowHelp(false)} />`
- In error handler for company fetch: call `removeRecentCompany(id)` to clean stale entries

- [ ] **Step 2: Update SearchBar to accept ref as a prop (React 19 pattern)**

Modify `SearchBar.tsx`:
- Add `ref?: React.Ref<HTMLInputElement>` to the Props interface (React 19 passes ref as a regular prop, no `forwardRef` needed)
- Pass `ref` to the `<input>` element
- Add `addRecentCompany` and recents state update to `page.tsx`'s successful fetch handler (not in SearchBar)

- [ ] **Step 3: Add data attributes to AttentionGroup for keyboard navigation**

Modify `AttentionGroup.tsx`:
- Add `data-attention-group={group.signal}` to the group container div
- Add `data-attention-item` and `data-company-id={company.id}` to each company row

Modify `AttentionList.tsx`:
- Pass through a `focusedIndex` prop and `onFocusChange` callback if needed
- Alternatively, handle focus purely via DOM data attributes in the keyboard hook

- [ ] **Step 4: Verify full integration in browser**

Run: `npm run dev`
Check:
- Cmd+K focuses and clears search bar
- Esc closes cheat sheet, blurs search, navigates back (in priority order)
- Arrow keys highlight items in attention list (visible highlight style)
- Enter opens highlighted company
- Number keys jump to attention groups
- ? toggles cheat sheet overlay
- Back arrow appears after clicking from attention list
- Recent companies show in search dropdown
- Activity filters work in company detail view

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/components/SearchBar.tsx src/components/AttentionGroup.tsx src/components/AttentionList.tsx
git commit -m "feat: wire keyboard shortcuts, search ref, and focus management"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (sort-attention, recent-companies, filter-activities)

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 3: Full manual verification**

Run: `npm run dev`
Walk through all 5 features end to end:
1. Attention groups sort by MRR (default), toggle to days overdue/silent
2. Search bar shows recents on focus, Cmd+K badge visible, recents filter as you type
3. Back arrow from attention list, scroll restoration, no back arrow from search
4. All keyboard shortcuts work (Cmd+K, Esc, arrows, Enter, 1-4, ?)
5. Activity filters: type pills toggle, date range presets, count updates, empty state

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: batch 1 final adjustments"
```
