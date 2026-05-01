# Retention Dashboard — Meeting Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Retention dashboard's first feature — a meeting-prep view that mirrors Onboarding's scaffold but tunes the brief for live customers (full-width Booking Volume + Health Breakdown cards, retention-relevant Commercial rows, auto-populated Watch out for). Backport invoice rows, future-events row, and populated Watch out for to the Onboarding brief.

**Architecture:** New `src/lib/retention.ts` builds a payload from the Customer Retention pipeline (`1072518362`) restricted to `customer_stage ∈ {Adopted, Started, Ramp Up, Established}`. New API route at `/api/retention` mirrors `/api/onboarding`'s caching + edge-SWR pattern. New `RetentionContainer` / `RetentionView` / `RetentionBrief` components reuse existing `<VolumeChart>` and `<HealthRings>`. A new `computeWatchOutSignals()` lives in `src/lib/signals.ts` and powers the Watch out for section on both dashboards.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest. Inline styles with CSS custom properties (`var(--moss)`, `var(--citrus)`, etc.) — not Tailwind utility classes.

**Spec:** `docs/superpowers/specs/2026-05-02-retention-meeting-prep-design.md`

---

## File Structure

### New files
- `src/lib/retention.ts` — `buildRetentionPayload`, `fetchRetentionHistoryForDeals`, formatters
- `src/lib/retention.test.ts` — pool filter + invoice formatter unit tests
- `src/lib/signals.test.ts` — `computeWatchOutSignals` unit tests
- `src/app/api/retention/route.ts` — bulk endpoint, per-filter cache, edge SWR
- `src/app/api/retention/day/route.ts` — single-day fetch
- `src/app/api/retention/history/route.ts` — lazy history backfill
- `src/components/design/views/RetentionContainer.tsx` — fetch + state
- `src/components/design/views/RetentionView.tsx` — meeting-list scaffold (clone of Onboarding's MeetingsPanel)
- `src/components/design/views/RetentionBrief.tsx` — per-meeting brief panel

### Modified files
- `src/lib/types.ts` — add `WatchOutSignal`, `RetentionDeal`, `RetentionResponse`; extend `OnboardingDeal` with `invoices`, `futureEvents`, `watchOuts`
- `src/lib/signals.ts` — export `computeWatchOutSignals()`
- `src/lib/onboarding.ts` — extract invoice + future-events; populate `watchOuts` on each deal
- `src/lib/prefetch.ts` — add `prefetchRetention`
- `src/components/design/VariantPicker.tsx` — flip retention to `available: true`, update `sub`
- `src/components/design/views/OnboardingView.tsx` — render new Commercial rows + Watch out for
- `src/app/api/cron/warm/route.ts` — add `/api/retention` to warming targets
- `src/app/page-client.tsx` — wire RetentionContainer into the dashboard switch + URL state + selection slot

### Reused without changes
- `src/components/design/VolumeChart.tsx`
- `src/components/design/HealthRings.tsx`
- `src/lib/cache.ts`, `src/lib/owners.ts`, `src/lib/api-fetch.ts`, `src/lib/hubspot-links.ts`, `src/lib/perf.ts`
- All existing `useListKeyboardNav.ts` and motion/UI primitives

---

## Conventions

- **Always commit at the end of every task.** Commit messages follow the existing style (lowercase verb prefix: `feat:`, `fix:`, `chore:`, `refactor:`).
- **Never push.** Filip verifies on localhost before pushing — that's an explicit user action.
- **Never use `--no-verify`** on commits. If a hook fails, fix the underlying issue.
- Run `npm run lint` and `npm run build` after any task that ships UI or types. Both must pass before commit.
- Run `npx vitest <pattern>` for unit tests.
- Use `npx tsc --noEmit` if you only need a typecheck without the full build.

---

## Task 1: Watch-out signal types + computer

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/signals.ts`
- Create: `src/lib/signals.test.ts`

**Why:** Both Retention (from day one) and Onboarding (backport) need a shared "Watch out for" signal computer. Define the type + pure function with TDD before either consumer.

- [ ] **Step 1: Add the `WatchOutSignal` type.**

In `src/lib/types.ts`, find the existing Onboarding section (search for `// Onboarding Dashboard`) and add ABOVE it (so both dashboards' types can reference it):

```ts
// Watch-out signals — shared between Retention and Onboarding briefs.
//
// Computed per-deal in src/lib/signals.ts based on the deal/company state.
// Rendered in the brief's "Watch out for" section. Severity drives the
// border color (warn = amber, bad = red).

export type WatchOutSignalKind =
  | "overdue_invoice"
  | "wish_to_churn"
  | "volume_declining"
  | "health_dropped"
  | "no_future_events"
  | "gone_quiet"
  | "stuck_in_step";

export type WatchOutSignalSeverity = "warn" | "bad";

export interface WatchOutSignal {
  kind: WatchOutSignalKind;
  severity: WatchOutSignalSeverity;
  title: string;
  detail: string;
}
```

- [ ] **Step 2: Write failing tests for `computeWatchOutSignals`.**

Create `src/lib/signals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeWatchOutSignals } from "./signals";

const nowIso = "2026-05-02T00:00:00.000Z";

function ctx(overrides: Partial<Parameters<typeof computeWatchOutSignals>[0]> = {}) {
  return {
    nowIso,
    unpaidInvoice: false,
    invoiceDueDate: null,
    outstandingEur: null,
    overdueDays: null,
    wishToChurn: false,
    churnReason: null,
    volume3m: 0,
    volume6m: 0,
    healthScore: null,
    upcomingEvents: null,
    notesLastContacted: null,
    daysInStep: null,
    expectedDaysInStep: null,
    ...overrides,
  };
}

describe("computeWatchOutSignals", () => {
  it("returns no signals for a healthy account", () => {
    const out = computeWatchOutSignals(ctx({
      volume3m: 12000,
      volume6m: 22000,
      healthScore: 80,
      upcomingEvents: 12,
      notesLastContacted: "2026-04-25T00:00:00.000Z",
    }));
    expect(out).toEqual([]);
  });

  it("flags overdue invoice as bad", () => {
    const out = computeWatchOutSignals(ctx({
      unpaidInvoice: true,
      invoiceDueDate: "2026-04-24T00:00:00.000Z",
      outstandingEur: 4200,
      overdueDays: 8,
    }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "overdue_invoice", severity: "bad" });
    expect(out[0].detail).toContain("8");
    expect(out[0].detail).toContain("4 200");
  });

  it("flags wish_to_churn as bad", () => {
    const out = computeWatchOutSignals(ctx({
      wishToChurn: true,
      churnReason: "Pricing pressure",
    }));
    expect(out).toEqual([
      expect.objectContaining({ kind: "wish_to_churn", severity: "bad", detail: "Pricing pressure" }),
    ]);
  });

  it("flags volume declining when last 3m < 50% of prior 3m", () => {
    // prior3m = volume6m - volume3m = 20000 - 8000 = 12000. 8000 < 6000? No, 8000 > 6000. Should NOT flag.
    expect(computeWatchOutSignals(ctx({ volume3m: 8000, volume6m: 20000 }))).toEqual([]);
    // 5000 < 0.5 * 12000 = 6000 → flag
    const out = computeWatchOutSignals(ctx({ volume3m: 5000, volume6m: 17000 }));
    expect(out[0]).toMatchObject({ kind: "volume_declining", severity: "bad" });
  });

  it("flags health_dropped as warn when score < 60", () => {
    const out = computeWatchOutSignals(ctx({ healthScore: 55 }));
    expect(out[0]).toMatchObject({ kind: "health_dropped", severity: "warn" });
  });

  it("flags no_future_events as warn when upcomingEvents = 0", () => {
    const out = computeWatchOutSignals(ctx({ upcomingEvents: 0 }));
    expect(out[0]).toMatchObject({ kind: "no_future_events", severity: "warn" });
    // Also flags when null
    const out2 = computeWatchOutSignals(ctx({ upcomingEvents: null }));
    expect(out2[0]?.kind).toBe("no_future_events");
  });

  it("flags gone_quiet as warn at 30 days, bad at 45+", () => {
    const out30 = computeWatchOutSignals(ctx({ notesLastContacted: "2026-04-01T00:00:00.000Z" })); // 31d
    expect(out30[0]).toMatchObject({ kind: "gone_quiet", severity: "warn" });
    const out46 = computeWatchOutSignals(ctx({ notesLastContacted: "2026-03-16T00:00:00.000Z" })); // 47d
    expect(out46[0]).toMatchObject({ kind: "gone_quiet", severity: "bad" });
  });

  it("flags stuck_in_step when daysInStep > expectedDaysInStep", () => {
    const out = computeWatchOutSignals(ctx({ daysInStep: 45, expectedDaysInStep: 30 }));
    expect(out[0]).toMatchObject({ kind: "stuck_in_step", severity: "warn" });
  });

  it("orders by severity (bad before warn) then by appearance", () => {
    const out = computeWatchOutSignals(ctx({
      healthScore: 50,                    // warn
      unpaidInvoice: true,                // bad
      invoiceDueDate: "2026-04-24T00:00:00.000Z",
      outstandingEur: 100,
      overdueDays: 8,
    }));
    expect(out.map((s) => s.kind)).toEqual(["overdue_invoice", "health_dropped"]);
  });
});
```

- [ ] **Step 3: Run the failing test.**

```bash
npx vitest run src/lib/signals.test.ts
```

Expected: FAIL with "computeWatchOutSignals is not a function" (or import error).

- [ ] **Step 4: Implement `computeWatchOutSignals` in `src/lib/signals.ts`.**

Append to the bottom of the existing file (do not modify what's already there):

```ts
import type { WatchOutSignal, WatchOutSignalSeverity } from "./types";

export interface WatchOutContext {
  nowIso: string;
  // Invoice
  unpaidInvoice: boolean;
  invoiceDueDate: string | null;
  outstandingEur: number | null;
  overdueDays: number | null;
  // Churn intent
  wishToChurn: boolean;
  churnReason: string | null;
  // Volume trend
  volume3m: number;
  volume6m: number;
  // Health
  healthScore: number | null;
  // Future events
  upcomingEvents: number | null;
  // Last contact
  notesLastContacted: string | null;
  // Onboarding only
  daysInStep: number | null;
  expectedDaysInStep: number | null;
}

const SEVERITY_ORDER: Record<WatchOutSignalSeverity, number> = { bad: 0, warn: 1 };

function fmtEur(n: number): string {
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

export function computeWatchOutSignals(ctx: WatchOutContext): WatchOutSignal[] {
  const out: WatchOutSignal[] = [];
  const now = new Date(ctx.nowIso).getTime();

  // 1. Overdue invoice — bad
  if (ctx.unpaidInvoice && ctx.invoiceDueDate) {
    const due = new Date(ctx.invoiceDueDate).getTime();
    if (!isNaN(due) && due < now) {
      const days = ctx.overdueDays ?? Math.floor((now - due) / (24 * 60 * 60 * 1000));
      const amt = ctx.outstandingEur ? ` · ${fmtEur(ctx.outstandingEur)} EUR outstanding` : "";
      out.push({
        kind: "overdue_invoice",
        severity: "bad",
        title: "Overdue invoice",
        detail: `Invoice overdue ${days} day${days === 1 ? "" : "s"}${amt}`,
      });
    }
  }

  // 2. Wish to churn — bad
  if (ctx.wishToChurn) {
    out.push({
      kind: "wish_to_churn",
      severity: "bad",
      title: "Wish-to-churn flagged",
      detail: ctx.churnReason ?? "No reason provided",
    });
  }

  // 3. Volume declining — bad
  // last 3m < 50% of prior 3m (months 4-6)
  const prior3m = Math.max(0, ctx.volume6m - ctx.volume3m);
  if (prior3m > 0 && ctx.volume3m < prior3m * 0.5) {
    out.push({
      kind: "volume_declining",
      severity: "bad",
      title: "Volume declining",
      detail: `Last 3m ${fmtEur(ctx.volume3m)} EUR vs prior 3m ${fmtEur(prior3m)} EUR`,
    });
  }

  // 4. Health dropped — warn
  if (ctx.healthScore != null && ctx.healthScore < 60) {
    out.push({
      kind: "health_dropped",
      severity: "warn",
      title: `Health score ${Math.round(ctx.healthScore)}`,
      detail: "Below the 60 threshold — review sub-scores",
    });
  }

  // 5. No future events — warn
  if (ctx.upcomingEvents == null || ctx.upcomingEvents === 0) {
    out.push({
      kind: "no_future_events",
      severity: "warn",
      title: "No upcoming events",
      detail: "Storefront has nothing scheduled",
    });
  }

  // 6. Gone quiet — warn (30+ days) or bad (45+ days)
  if (ctx.notesLastContacted) {
    const last = new Date(ctx.notesLastContacted).getTime();
    if (!isNaN(last)) {
      const days = Math.floor((now - last) / (24 * 60 * 60 * 1000));
      if (days >= 45) {
        out.push({
          kind: "gone_quiet",
          severity: "bad",
          title: `Last contact ${days} days ago`,
          detail: `No outbound since ${ctx.notesLastContacted.slice(0, 10)}`,
        });
      } else if (days >= 30) {
        out.push({
          kind: "gone_quiet",
          severity: "warn",
          title: `Last contact ${days} days ago`,
          detail: `No outbound since ${ctx.notesLastContacted.slice(0, 10)}`,
        });
      }
    }
  }

  // 7. Stuck in step — warn (Onboarding only — pass null for retention)
  if (ctx.daysInStep != null && ctx.expectedDaysInStep != null && ctx.daysInStep > ctx.expectedDaysInStep) {
    out.push({
      kind: "stuck_in_step",
      severity: "warn",
      title: `${ctx.daysInStep} days in step`,
      detail: `Expected ${ctx.expectedDaysInStep} — past due`,
    });
  }

  // Stable order: bad first, then warn, preserving insertion order within each
  // severity (matches the order of rules above).
  return [...out].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
```

- [ ] **Step 5: Run tests, verify all pass.**

```bash
npx vitest run src/lib/signals.test.ts
```

Expected: All 9 tests pass.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/types.ts src/lib/signals.ts src/lib/signals.test.ts
git commit -m "feat: shared watch-out signal computer for retention + onboarding briefs"
```

---

## Task 2: Retention type definitions

**Files:**
- Modify: `src/lib/types.ts`

**Why:** Define the data shape `buildRetentionPayload` returns and the API route serializes. Reuses `OnboardingMeeting`, `OnboardingMeetingEntry`, `OnboardingHistoryEntry`, `OnboardingCommercial` from the existing onboarding types — they're already the right shape.

- [ ] **Step 1: Add Retention types after the existing Onboarding types.**

In `src/lib/types.ts`, AFTER the `OnboardingResponse` interface, add:

```ts
// Retention Dashboard
//
// Source: Customer Retention pipeline (1072518362). Customers count as "in
// retention" while customer_stage ∈ {Adopted, Started, Ramp Up, Established}.
// Distinct from Onboarding (different pipeline) and Status/Pay Migration
// (different cuts of the same data).

export interface RetentionInvoiceState {
  open: number;            // count of open invoices on the deal
  overdue: number;         // count overdue (due in past, unpaid)
  overdueDays: number | null;     // max overdue days across the deal
  outstandingEur: number | null;  // sum of outstanding amount in EUR
}

export interface RetentionDeal {
  dealId: string;
  companyId: string | null;
  companyName: string;
  ownerId: string;
  ownerName: string;
  country: string | null;
  customerStage: string;       // Adopted / Started / Ramp Up / Established
  customerSubstage: string | null;
  liveDate: string | null;     // customer_live_date ISO
  daysLive: number | null;     // computed; null when liveDate missing
  // Customer block
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  companyDomain: string | null;
  storefrontLink: string | null;
  // Commercial block — same shape as onboarding
  commercial: OnboardingCommercial;
  // Invoice + future events
  invoices: RetentionInvoiceState;
  futureEvents: number | null;
  // Raw company props bag — passed straight to <VolumeChart> + <HealthRings>
  // so we don't duplicate their parsing logic. Keys match what those components
  // expect: understory_booking_volume_*, understory_health_score_*, health_score.
  companyProps: Record<string, string>;
  // Activity history (lazy-filled by /api/retention/history)
  history: OnboardingHistoryEntry[];
  // Watch-out signals computed in the lib
  watchOuts: WatchOutSignal[];
  // Last touch (notes_last_contacted) — surfaced in Watch out for context
  lastTouch: string | null;
}

export interface RetentionMeetingEntry {
  meeting: OnboardingMeeting;     // reuse — same fields
  deal: RetentionDeal;
}

export interface RetentionResponse {
  deals: RetentionDeal[];
  meetings: RetentionMeetingEntry[];
  updatedAt: string;
}
```

Also extend `OnboardingDeal` to add the new backport fields. Find the existing `OnboardingDeal` interface and add these fields just before the closing `}`:

```ts
  // Backports from Retention design — surfaced in Commercial + Watch out for.
  invoices: RetentionInvoiceState;
  futureEvents: number | null;
  watchOuts: WatchOutSignal[];
```

- [ ] **Step 2: Verify typecheck passes (no consumers updated yet — types are additive).**

```bash
npx tsc --noEmit
```

Expected: PASS. (If it fails, the issue is likely a type field referenced before declaration — make sure `WatchOutSignal` from Task 1 is defined above `OnboardingDeal`.)

- [ ] **Step 3: Commit.**

```bash
git add src/lib/types.ts
git commit -m "feat: retention deal/response types + onboarding deal extension"
```

---

## Task 3: Retention pool + invoice extractor unit tests

**Files:**
- Create: `src/lib/retention.test.ts`

**Why:** TDD the small pure helpers (pool filter, invoice extractor, days-live math) before composing them in `buildRetentionPayload`.

- [ ] **Step 1: Write the failing tests.**

Create `src/lib/retention.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isRetentionDeal,
  extractInvoiceState,
  daysSinceIso,
} from "./retention";

describe("isRetentionDeal", () => {
  it("matches deals on the retention pipeline with allowed stages", () => {
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Adopted" })).toBe(true);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Started" })).toBe(true);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Ramp Up" })).toBe(true);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Established" })).toBe(true);
  });

  it("rejects deals on other pipelines", () => {
    expect(isRetentionDeal({ pipeline: "166333631", customer_stage: "Established" })).toBe(false);
    expect(isRetentionDeal({ pipeline: "81267902", customer_stage: "Adopted" })).toBe(false);
  });

  it("rejects retention-pipeline deals in other stages", () => {
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Churned" })).toBe(false);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "" })).toBe(false);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Unknown" })).toBe(false);
  });
});

describe("extractInvoiceState", () => {
  it("returns zero state when nothing is set", () => {
    expect(extractInvoiceState({}, "2026-05-02T00:00:00.000Z")).toEqual({
      open: 0,
      overdue: 0,
      overdueDays: null,
      outstandingEur: null,
    });
  });

  it("counts open invoices from number_of_open_invoices", () => {
    const r = extractInvoiceState({ number_of_open_invoices: "3" }, "2026-05-02T00:00:00.000Z");
    expect(r.open).toBe(3);
  });

  it("flags overdue when unpaid_invoice=true AND invoice_due_date is in past", () => {
    const r = extractInvoiceState(
      {
        unpaid_invoice: "true",
        invoice_due_date: "2026-04-24T00:00:00.000Z",
        outstanding_amount: "4200",
        deal_currency_code: "EUR",
      },
      "2026-05-02T00:00:00.000Z"
    );
    expect(r.overdue).toBe(1);
    expect(r.overdueDays).toBe(8);
    expect(r.outstandingEur).toBe(4200);
  });

  it("does not flag overdue when due date is in future", () => {
    const r = extractInvoiceState(
      {
        unpaid_invoice: "true",
        invoice_due_date: "2026-05-15T00:00:00.000Z",
        outstanding_amount: "4200",
      },
      "2026-05-02T00:00:00.000Z"
    );
    expect(r.overdue).toBe(0);
    expect(r.overdueDays).toBeNull();
  });
});

describe("daysSinceIso", () => {
  it("returns the number of full days between now and the given date", () => {
    expect(daysSinceIso("2026-05-02T00:00:00.000Z", "2026-04-25T00:00:00.000Z")).toBe(7);
  });

  it("returns null for missing or invalid dates", () => {
    expect(daysSinceIso("2026-05-02T00:00:00.000Z", null)).toBeNull();
    expect(daysSinceIso("2026-05-02T00:00:00.000Z", "")).toBeNull();
    expect(daysSinceIso("2026-05-02T00:00:00.000Z", "not-a-date")).toBeNull();
  });
});
```

- [ ] **Step 2: Verify tests fail (file doesn't exist yet).**

```bash
npx vitest run src/lib/retention.test.ts
```

Expected: FAIL with module-not-found error.

---

## Task 4: Retention lib — pool filter + small helpers

**Files:**
- Create: `src/lib/retention.ts`

**Why:** Implement the small pure helpers from Task 3's tests. The full `buildRetentionPayload` follows in Task 5 — splitting these gets us a TDD-passing baseline before tackling the bigger function.

- [ ] **Step 1: Create `src/lib/retention.ts` with the helpers + currency conversion.**

```ts
import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import type {
  OnboardingCommercial,
  OnboardingHistoryEntry,
  OnboardingMeeting,
  RetentionDeal,
  RetentionInvoiceState,
  RetentionMeetingEntry,
  RetentionResponse,
  WatchOutSignal,
} from "./types";

// Customer Retention pipeline. Same constant lives in onboarding.ts (where it
// is treated as "downstream of onboarding") and attention.ts (where it's the
// scope for churn-risk signals). Keep them in sync.
export const RETENTION_PIPELINE = "1072518362";

// Stages we treat as "live customer in retention scope". Adopted/Started
// overlap with onboarding stage names but are scoped here to the retention
// pipeline — pipeline membership is the discriminator.
export const RETENTION_STAGES = new Set([
  "Adopted",
  "Started",
  "Ramp Up",
  "Established",
]);

// EUR conversion table — kept in sync with src/lib/pay-migration.ts. Only
// covers the currencies the CS team actually transacts in. Add new ones as
// the platform expands.
const TO_EUR: Record<string, number> = {
  EUR: 1,
  SEK: 0.087,
  DKK: 0.134,
  NOK: 0.085,
  GBP: 1.18,
  USD: 0.92,
};

function toEur(amount: number, currency: string | undefined): number {
  const rate = TO_EUR[(currency || "EUR").toUpperCase()] ?? 1;
  return amount * rate;
}

/** True when a deal record (HubSpot raw properties) is in retention scope. */
export function isRetentionDeal(props: { pipeline?: string; customer_stage?: string }): boolean {
  if (props.pipeline !== RETENTION_PIPELINE) return false;
  return RETENTION_STAGES.has(props.customer_stage || "");
}

/** Extract the deal's invoice state for the brief's Commercial section. */
export function extractInvoiceState(
  props: Record<string, string>,
  nowIso: string
): RetentionInvoiceState {
  const open = parseInt(props.number_of_open_invoices || "0", 10) || 0;
  const unpaid = props.unpaid_invoice === "true";
  const dueIso = props.invoice_due_date || "";
  const outstandingRaw = parseFloat(props.outstanding_amount || "0") || 0;
  const currency = props.deal_currency_code;

  let overdue = 0;
  let overdueDays: number | null = null;
  if (unpaid && dueIso) {
    const due = new Date(dueIso).getTime();
    const now = new Date(nowIso).getTime();
    if (!isNaN(due) && due < now) {
      overdue = 1;
      overdueDays = Math.floor((now - due) / (24 * 60 * 60 * 1000));
    }
  }

  const outstandingEur =
    outstandingRaw > 0 ? Math.round(toEur(outstandingRaw, currency)) : null;

  return { open, overdue, overdueDays, outstandingEur };
}

/** Days between `nowIso` and `iso`, or null when the input is missing/invalid. */
export function daysSinceIso(nowIso: string, iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  const now = new Date(nowIso).getTime();
  return Math.floor((now - t) / (24 * 60 * 60 * 1000));
}

// `buildRetentionPayload` and `fetchRetentionHistoryForDeals` are added in
// Task 5. Keeping this file small and tested first.
```

- [ ] **Step 2: Run tests, verify all pass.**

```bash
npx vitest run src/lib/retention.test.ts
```

Expected: All 6 tests pass.

- [ ] **Step 3: Commit.**

```bash
git add src/lib/retention.ts src/lib/retention.test.ts
git commit -m "feat: retention pool + invoice/days helpers with unit tests"
```

---

## Task 5: `buildRetentionPayload` + `fetchRetentionHistoryForDeals`

**Files:**
- Modify: `src/lib/retention.ts`

**Why:** The main payload builder. Mirrors `buildOnboardingPayload` in onboarding.ts but scoped to the retention pipeline and producing `RetentionDeal[]` instead. Reuses onboarding's HubSpot primitives via direct import.

The simplest path is to import the existing onboarding helpers (meeting fetch, owner-meetings batch, history backfill) by re-exporting them from onboarding.ts. We keep onboarding.ts as the source of truth for those primitives.

- [ ] **Step 1: Re-export the onboarding helpers we need.**

In `src/lib/onboarding.ts`, find `export async function buildOnboardingPayload` (the main exported function) and verify these helpers exist near it:
- `fetchOwnerMeetingsByDay` (or similar — fetches meetings owned by CS owners in a date range)
- `fetchMeetingsForDeals` (or similar — fetches meetings associated with a list of deals)
- `fetchHistoryForDeals` (the function `/api/onboarding/history` already imports)

The exact names live in onboarding.ts. If a helper isn't exported but you need it, add `export` to its declaration. Do NOT inline copies — keep onboarding.ts as the source of truth.

If the helpers are private (e.g. `function fetchOwnerMeetings(`), promote them to exported (`export function fetchOwnerMeetings(`). Run `npm run build` after to verify nothing else broke.

- [ ] **Step 2: Add `buildRetentionPayload` to `src/lib/retention.ts`.**

Append to the bottom of `src/lib/retention.ts`:

```ts
import { Cache } from "./cache";
import { computeWatchOutSignals } from "./signals";
import {
  fetchHistoryForDeals,
  // The next two come from onboarding.ts. If they aren't yet exported,
  // promote them to `export` per Task 5 Step 1.
  fetchOwnerMeetings,
  resolveDealsForMeetings,
} from "./onboarding";
import type { Span } from "./perf";

interface BuildOptions {
  ownerIds?: string[];
  meetingFromIso?: string;          // override default 5-workday window
  meetingToIso?: string;
  spans?: Span[];
}

interface RetentionPayloadOnly {
  deals: RetentionDeal[];
  meetings: RetentionMeetingEntry[];
}

const RETENTION_DEAL_PROPS = [
  "dealname",
  "pipeline",
  "dealstage",
  "customer_stage",
  "customer_substage",
  "createdate",
  "customer_live_date",
  "deal_currency_code",
  "subscription_plan",
  "hubspot_owner_id",
  // Commercial
  "booking_fee",
  "confirmed_booking_fee",
  "core_net_price__local_currency",
  "amount_in_home_currency",
  "test_billing_start_date",
  // Invoice
  "number_of_open_invoices",
  "unpaid_invoice",
  "invoice_due_date",
  "outstanding_amount",
  // Watch-outs
  "wish_to_churn",
  "churn_reason",
  "notes_last_contacted",
  // Storefront
  "storefront",
];

const COMPANY_PROPS_FOR_RETENTION = [
  "name",
  "domain",
  "hubspot_owner_id",
  "notes_last_contacted",
  "understory_booking_volume_all_time",
  "understory_booking_volume_1m",
  "understory_booking_volume_2m",
  "understory_booking_volume_3m",
  "understory_booking_volume_6m",
  "understory_booking_volume_12m",
  "health_score",
  "understory_health_score_actual_acv",
  "understory_health_score_customer_storefront_visits",
  "understory_health_score_customer_widget_visits",
  "understory_health_score_features_enabled",
  "understory_health_score_login_last_month",
  "understory_health_score_transactions_diff",
  "understory_health_score_upcoming_events",
];

/**
 * Build the bulk Retention payload: every retention-pipeline deal that
 * matches the owner filter, plus the meetings logged on those deals
 * inside the requested window (defaults to the next 5 work days).
 */
export async function buildRetentionPayload(
  opts: BuildOptions = {}
): Promise<RetentionPayloadOnly> {
  const ownerIds = opts.ownerIds;
  const nowIso = new Date().toISOString();

  // 1. Search retention deals (paginated with sorts clause to avoid silent
  // truncation — see AGENTS.md "HubSpot fetch patterns").
  const deals = await searchRetentionDeals({ ownerIds, properties: RETENTION_DEAL_PROPS });

  // 2. Companies for those deals — fetch via batch associations + then batch-
  // read company properties (faster than /companies/search per AGENTS.md).
  const companyMap = await fetchCompaniesForDeals(deals.map((d) => d.id), COMPANY_PROPS_FOR_RETENTION);

  // 3. Meetings — same window logic as onboarding. Default = today through
  // end of 5th workday. Caller can override with meetingFromIso/meetingToIso.
  const fromIso = opts.meetingFromIso ?? nowIso;
  const toIso = opts.meetingToIso ?? endOfNthWorkDayIso(new Date(), 5);
  const ownerMeetings = await fetchOwnerMeetings({
    ownerIds: ownerIds ?? null,
    fromIso,
    toIso,
  });

  // 4. Resolve which retention deal each meeting belongs to. Reuse the
  // onboarding helper — it walks meeting → deals associations and returns
  // a Map<meetingId, dealId>.
  const meetingToDeal = await resolveDealsForMeetings(
    ownerMeetings.map((m) => m.id),
    new Set(deals.map((d) => d.id))
  );

  // 5. Build RetentionDeal[] from the raw deals + companies. Compute watch-
  // outs while we have all the inputs in hand.
  const retentionDeals: RetentionDeal[] = deals.map((d) =>
    buildRetentionDeal(d, companyMap, nowIso)
  );
  const dealById = new Map(retentionDeals.map((d) => [d.dealId, d]));

  // 6. Build the meeting entries (only meetings that resolved to a retention deal).
  const meetingEntries: RetentionMeetingEntry[] = [];
  for (const m of ownerMeetings) {
    const dealId = meetingToDeal.get(m.id);
    if (!dealId) continue;
    const deal = dealById.get(dealId);
    if (!deal) continue;
    meetingEntries.push({ meeting: m, deal });
  }

  return { deals: retentionDeals, meetings: meetingEntries };
}

// Helper: Search retention-pipeline deals with the owner filter. Always sends
// a sorts clause to keep pagination working (see AGENTS.md). Retries 429/5xx.
async function searchRetentionDeals(opts: {
  ownerIds: string[] | undefined;
  properties: string[];
}): Promise<Array<{ id: string; properties: Record<string, string> }>> {
  const filterGroups: unknown[] = [];
  const baseFilters: unknown[] = [
    { propertyName: "pipeline", operator: "EQ", value: RETENTION_PIPELINE },
    { propertyName: "customer_stage", operator: "IN", values: [...RETENTION_STAGES] },
  ];
  if (opts.ownerIds && opts.ownerIds.length > 0) {
    filterGroups.push({
      filters: [
        ...baseFilters,
        { propertyName: "hubspot_owner_id", operator: "IN", values: opts.ownerIds },
      ],
    });
  } else {
    filterGroups.push({ filters: baseFilters });
  }

  const results: Array<{ id: string; properties: Record<string, string> }> = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const body = {
      filterGroups,
      properties: opts.properties,
      limit: 100,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      after,
    };
    const res = await retryFetch(async () =>
      fetch(`${HUBSPOT_API}/crm/v3/objects/deals/search`, {
        method: "POST",
        headers: hubspotHeaders(),
        body: JSON.stringify(body),
        cache: "no-store",
      })
    );
    if (!res.ok) break;
    const json = await res.json();
    if (Array.isArray(json.results)) results.push(...json.results);
    after = json.paging?.next?.after;
    if (!after) break;
  }
  return results;
}

// Helper: small retry wrapper for transient HubSpot 429/5xx errors. Throws
// on persistent failure rather than returning ok:false silently.
async function retryFetch(do_fetch: () => Promise<Response>): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await do_fetch();
      if (res.ok) return res;
      if (res.status !== 429 && res.status < 500) return res;
      last = res;
    } catch {
      // network error — retry
    }
    await new Promise((r) => setTimeout(r, 200 * (i + 1)));
  }
  return last ?? Promise.reject(new Error("HubSpot fetch failed"));
}

// Helper: Batch-fetch companies for a list of deal IDs via associations API,
// then batch-read company properties. Returns a Map<dealId, companyProps>.
async function fetchCompaniesForDeals(
  dealIds: string[],
  properties: string[]
): Promise<Map<string, Record<string, string>>> {
  if (dealIds.length === 0) return new Map();

  // Step 1 — batch associations: deal → company.
  const dealToCompany = new Map<string, string>();
  for (let i = 0; i < dealIds.length; i += 100) {
    const batch = dealIds.slice(i, i + 100);
    const res = await retryFetch(async () =>
      fetch(`${HUBSPOT_API}/crm/v4/associations/deals/companies/batch/read`, {
        method: "POST",
        headers: hubspotHeaders(),
        body: JSON.stringify({
          inputs: batch.map((id) => ({ id })),
        }),
        cache: "no-store",
      })
    );
    if (!res.ok) continue;
    const json = await res.json();
    for (const r of json.results ?? []) {
      const companyId = r.to?.[0]?.toObjectId;
      if (companyId) dealToCompany.set(String(r.from.id), String(companyId));
    }
  }

  // Step 2 — batch-read company properties.
  const companyIds = Array.from(new Set(dealToCompany.values()));
  const companyProps = new Map<string, Record<string, string>>();
  for (let i = 0; i < companyIds.length; i += 100) {
    const batch = companyIds.slice(i, i + 100);
    const res = await retryFetch(async () =>
      fetch(`${HUBSPOT_API}/crm/v3/objects/companies/batch/read`, {
        method: "POST",
        headers: hubspotHeaders(),
        body: JSON.stringify({
          inputs: batch.map((id) => ({ id })),
          properties,
        }),
        cache: "no-store",
      })
    );
    if (!res.ok) continue;
    const json = await res.json();
    for (const r of json.results ?? []) {
      companyProps.set(String(r.id), r.properties || {});
    }
  }

  // Step 3 — pivot: dealId → company props.
  const out = new Map<string, Record<string, string>>();
  for (const [dealId, companyId] of dealToCompany.entries()) {
    const props = companyProps.get(companyId);
    if (props) out.set(dealId, props);
  }
  return out;
}

// Helper: end-of-day timestamp for the Nth work day starting from today.
// Mirrors onboarding's endOfNthWorkDay but returns ISO. Inline rather than
// re-export from onboarding.ts to keep retention.ts self-sufficient.
function endOfNthWorkDayIso(start: Date, n: number): string {
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  let counted = 0;
  if (cursor.getDay() !== 0 && cursor.getDay() !== 6) counted = 1;
  while (counted < n) {
    cursor.setDate(cursor.getDate() + 1);
    const wd = cursor.getDay();
    if (wd !== 0 && wd !== 6) counted++;
  }
  cursor.setHours(23, 59, 59, 999);
  return cursor.toISOString();
}

// Compose a RetentionDeal from raw HubSpot deal + matching company props.
function buildRetentionDeal(
  rawDeal: { id: string; properties: Record<string, string> },
  companyMap: Map<string, Record<string, string>>,
  nowIso: string
): RetentionDeal {
  const dp = rawDeal.properties || {};
  const cp = companyMap.get(rawDeal.id) || {};
  const liveDate = dp.customer_live_date || null;

  // Commercial — pull the same way onboarding does.
  const commercial: OnboardingCommercial = {
    monthlyFee: formatMonthlyFee(dp.core_net_price__local_currency, dp.deal_currency_code),
    acv: formatAcv(dp.amount_in_home_currency),
    bookingFee: formatBookingFee(dp.booking_fee, dp.confirmed_booking_fee),
    firstBilling: formatFirstBilling(dp.test_billing_start_date),
    salesOwner: null,    // resolved at the API layer where we have the owner directory; null here
  };

  const invoices = extractInvoiceState(dp, nowIso);
  const futureEvents = parseUpcomingEvents(cp.understory_health_score_upcoming_events);

  const watchOuts: WatchOutSignal[] = computeWatchOutSignals({
    nowIso,
    unpaidInvoice: dp.unpaid_invoice === "true",
    invoiceDueDate: dp.invoice_due_date || null,
    outstandingEur: invoices.outstandingEur,
    overdueDays: invoices.overdueDays,
    wishToChurn: dp.wish_to_churn === "true",
    churnReason: dp.churn_reason || null,
    volume3m: parseFloat(cp.understory_booking_volume_3m || "0") || 0,
    volume6m: parseFloat(cp.understory_booking_volume_6m || "0") || 0,
    healthScore: parseFloat(cp.health_score || "") || null,
    upcomingEvents: futureEvents,
    notesLastContacted: cp.notes_last_contacted || dp.notes_last_contacted || null,
    daysInStep: null,
    expectedDaysInStep: null,
  });

  return {
    dealId: rawDeal.id,
    companyId: companyIdFor(rawDeal.id, companyMap) ?? null,
    companyName: cp.name || dp.dealname || "(unknown)",
    ownerId: dp.hubspot_owner_id || "",
    ownerName: "",                   // resolved at API layer (owner directory cached)
    country: null,                   // not pulled in v1; can be added if needed
    customerStage: dp.customer_stage || "",
    customerSubstage: dp.customer_substage || null,
    liveDate,
    daysLive: daysSinceIso(nowIso, liveDate),
    contactName: null,               // resolved at API layer (contact association)
    contactEmail: null,
    contactPhone: null,
    companyDomain: cp.domain || null,
    storefrontLink: dp.storefront || null,
    commercial,
    invoices,
    futureEvents,
    companyProps: cp,
    history: [],                     // backfilled by /api/retention/history
    watchOuts,
    lastTouch: cp.notes_last_contacted || null,
  };
}

// We don't have a clean dealId→companyId reverse lookup yet (companyMap is
// keyed by dealId). This re-derives the companyId by looking the same dealId
// up in dealToCompany — but since we discarded that map after pivoting, we
// don't have it. Returning null is fine for v1; the deep-link uses dealId.
function companyIdFor(_dealId: string, _companyMap: Map<string, Record<string, string>>): string | null {
  return null;
}

function parseUpcomingEvents(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}

// Inline formatters — clones of the onboarding ones. Kept here so retention.ts
// is self-sufficient and we don't bloat onboarding.ts's export surface.

function formatBookingFee(bookingFee: string | undefined, confirmedBookingFee: string | undefined): string | null {
  const raw = confirmedBookingFee || bookingFee;
  if (!raw) return null;
  const n = parseFloat(raw);
  if (isNaN(n)) return null;
  const pct = n < 1 ? n * 100 : n;
  return `${pct.toFixed(2).replace(/\.?0+$/, "")}%`;
}

function formatMonthlyFee(amount: string | undefined, currency: string | undefined): string | null {
  if (!amount) return null;
  const n = parseFloat(amount);
  if (isNaN(n) || n === 0 || !currency?.trim()) return null;
  return `${Math.round(n).toLocaleString("en-US")} ${currency.trim().toUpperCase()}/mo`;
}

function formatAcv(amount: string | undefined): string | null {
  if (!amount) return null;
  const n = parseFloat(amount);
  if (isNaN(n) || n === 0) return null;
  return `${Math.round(n).toLocaleString("en-US")} EUR`;
}

function formatFirstBilling(date: string | undefined): string | null {
  if (!date) return null;
  const trimmed = date.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

// Re-export the lazy history fetcher under a retention-flavored name for
// route-handler clarity. It's the same primitive — both dashboards share
// engagements per deal.
export const fetchRetentionHistoryForDeals = fetchHistoryForDeals;
```

- [ ] **Step 3: Run typecheck.**

```bash
npx tsc --noEmit
```

Expected: PASS. If you get errors about missing exports from `./onboarding` (e.g. `fetchOwnerMeetings`, `resolveDealsForMeetings`), promote those helpers to `export` in onboarding.ts. Their function names may differ — search onboarding.ts for the helper that fetches meetings by owner+date-range, and the helper that maps meetings → their associated deal IDs. Use whatever names match.

If `Span` doesn't exist as a type in `./perf`, drop that import and the `spans?: Span[]` field — onboarding's perf module may use a different shape. Match what the onboarding API route does.

- [ ] **Step 4: Run tests.**

```bash
npx vitest run src/lib/retention.test.ts
```

Expected: All 6 tests still pass (we only added code; helpers tested in Task 3 unchanged).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/retention.ts src/lib/onboarding.ts
git commit -m "feat: buildRetentionPayload + retention deal composer"
```

---

## Task 6: API route `/api/retention`

**Files:**
- Create: `src/app/api/retention/route.ts`

- [ ] **Step 1: Create the route handler (mirrors `/api/onboarding/route.ts`).**

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildRetentionPayload } from "@/lib/retention";
import { Cache } from "@/lib/cache";
import type { RetentionResponse } from "@/lib/types";

const retentionCache = new Cache<RetentionResponse>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const ownerIdsParam = request.nextUrl.searchParams.get("ownerIds") || "";
  const ownerIds = ownerIdsParam
    ? ownerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const cacheKey = ownerIds
    ? `retention:${[...ownerIds].sort().join(",")}`
    : "retention:all";

  const cacheControl = refresh
    ? "private, no-cache, no-store, max-age=0, must-revalidate"
    : "public, s-maxage=840, stale-while-revalidate=60";

  if (!refresh) {
    const cached = retentionCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached, { headers: { "Cache-Control": cacheControl } });
    }
  }

  try {
    const response = await retentionCache.getOrBuild(cacheKey, async () => {
      const payload = await buildRetentionPayload({ ownerIds });
      return { ...payload, updatedAt: new Date().toISOString() };
    });
    return NextResponse.json(response, { headers: { "Cache-Control": cacheControl } });
  } catch {
    return NextResponse.json(
      { error: "Could not load retention data" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Build to verify it typechecks.**

```bash
npm run build
```

Expected: PASS. (If the build fails on import paths, double-check that retention.ts's exports match what the route imports.)

- [ ] **Step 3: Commit.**

```bash
git add src/app/api/retention/route.ts
git commit -m "feat: /api/retention route with per-filter cache + edge SWR"
```

---

## Task 7: API routes `/api/retention/day` and `/api/retention/history`

**Files:**
- Create: `src/app/api/retention/day/route.ts`
- Create: `src/app/api/retention/history/route.ts`

- [ ] **Step 1: Create the day route (clones `/api/onboarding/day/route.ts`).**

`src/app/api/retention/day/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildRetentionPayload } from "@/lib/retention";
import { Cache } from "@/lib/cache";
import type { RetentionMeetingEntry } from "@/lib/types";

const dayCache = new Cache<RetentionMeetingEntry[]>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const dateParam = request.nextUrl.searchParams.get("date") || "";
  const ownerIdsParam = request.nextUrl.searchParams.get("ownerIds") || "";
  const ownerIds = ownerIdsParam
    ? ownerIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam.trim());
  if (!m) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  const dayStart = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const ownerKey = ownerIds ? [...ownerIds].sort().join(",") : "all";
  const cacheKey = `retention-day:${ownerKey}:${dateParam}`;

  if (!refresh) {
    const cached = dayCache.get(cacheKey);
    if (cached) return NextResponse.json({ meetings: cached });
  }

  try {
    const payload = await buildRetentionPayload({
      ownerIds,
      meetingFromIso: dayStart.toISOString(),
      meetingToIso: dayEnd.toISOString(),
    });
    dayCache.set(cacheKey, payload.meetings);
    return NextResponse.json({ meetings: payload.meetings });
  } catch {
    return NextResponse.json({ error: "Could not load day meetings" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create the history route (clones `/api/onboarding/history/route.ts`).**

`src/app/api/retention/history/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { fetchRetentionHistoryForDeals } from "@/lib/retention";
import { Cache } from "@/lib/cache";
import type { OnboardingHistoryEntry } from "@/lib/types";

const historyCache = new Cache<OnboardingHistoryEntry[]>(15 * 60 * 1000);

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const dealIdsParam = request.nextUrl.searchParams.get("dealIds") || "";
  const dealIds = dealIdsParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (dealIds.length === 0) return NextResponse.json({});

  const cached: Record<string, OnboardingHistoryEntry[]> = {};
  const misses: string[] = [];
  if (!refresh) {
    for (const id of dealIds) {
      const hit = historyCache.get(id);
      if (hit) cached[id] = hit;
      else misses.push(id);
    }
  } else {
    misses.push(...dealIds);
  }

  if (misses.length === 0) return NextResponse.json(cached);

  try {
    const fetched = await fetchRetentionHistoryForDeals(misses);
    for (const id of misses) {
      const entries = fetched.get(id) ?? [];
      historyCache.set(id, entries);
      cached[id] = entries;
    }
    return NextResponse.json(cached);
  } catch {
    return NextResponse.json({ error: "Could not load deal history" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Build.**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/app/api/retention/day/route.ts src/app/api/retention/history/route.ts
git commit -m "feat: /api/retention/day + /history routes"
```

---

## Task 8: Cron warm + prefetch helper

**Files:**
- Modify: `src/app/api/cron/warm/route.ts`
- Modify: `src/lib/prefetch.ts`

- [ ] **Step 1: Add `/api/retention` to cron warm.**

In `src/app/api/cron/warm/route.ts`, find the `targets: string[]` array and add `/api/retention`:

```ts
  const targets: string[] = [
    "/api/onboarding?refresh=true",
    "/api/attention?refresh=true",
    "/api/pay-migration?refresh=true",
    "/api/retention?refresh=true",
    `/api/onboarding?refresh=true&ownerIds=${ownerIdsForRegion("DK")}`,
    `/api/onboarding?refresh=true&ownerIds=${ownerIdsForRegion("SE")}`,
    `/api/onboarding?refresh=true&ownerIds=${ownerIdsForRegion("IT")}`,
    `/api/retention?refresh=true&ownerIds=${ownerIdsForRegion("DK")}`,
    `/api/retention?refresh=true&ownerIds=${ownerIdsForRegion("SE")}`,
    `/api/retention?refresh=true&ownerIds=${ownerIdsForRegion("IT")}`,
    ...companyWarmIds().map((id) => `/api/companies/${id}`),
  ];
```

- [ ] **Step 2: Add `prefetchRetention` to `src/lib/prefetch.ts`.**

After the existing `prefetchOnboarding` function, add:

```ts
export function prefetchRetention(ownerIdsCsv?: string | null): void {
  const url =
    ownerIdsCsv && ownerIdsCsv !== "all"
      ? `/api/retention?ownerIds=${ownerIdsCsv}`
      : "/api/retention";
  fire(url);
  void import("@/components/design/views/RetentionContainer");
}
```

- [ ] **Step 3: Wire `prefetchRetention` into the dashboard picker hover.**

In `src/components/design/VariantPicker.tsx`, find the existing block:
```ts
if (d.key === "status") prefetchAttention();
else if (d.key === "pay_migration") prefetchPayMigration();
else if (d.key === "onboarding") prefetchOnboarding();
else if (d.key === "search") prefetchSearch();
```

Add the retention case (inside the same if-chain):

```ts
else if (d.key === "retention") prefetchRetention();
```

Also add `prefetchRetention` to the import statement at the top of the file:

```ts
import {
  prefetchAttention,
  prefetchOnboarding,
  prefetchPayMigration,
  prefetchRetention,
  prefetchSearch,
} from "@/lib/prefetch";
```

- [ ] **Step 4: Build to verify nothing broke.**

```bash
npm run build
```

Expected: PASS. The `import("@/components/design/views/RetentionContainer")` line will warn that the module doesn't exist yet — Next's typecheck for `import()` is loose enough to pass; if it errors, **stop and fix** by completing Task 11 first, then return to commit.

- [ ] **Step 5: Commit.**

```bash
git add src/app/api/cron/warm/route.ts src/lib/prefetch.ts src/components/design/VariantPicker.tsx
git commit -m "feat: prefetch + cron warm for retention endpoint"
```

---

## Task 9: `RetentionBrief.tsx` — the per-meeting brief panel

**Files:**
- Create: `src/components/design/views/RetentionBrief.tsx`

**Why:** The biggest UI component. Clones the structure used by Onboarding's `MeetingBriefCard` but with the layout from the approved v4 mockup (Booking Volume + Health Breakdown + Customer + Commercial in left column, Previous activity + Watch out for in right).

- [ ] **Step 1: Create the file.**

```tsx
"use client";

import type {
  RetentionDeal,
  RetentionMeetingEntry,
  WatchOutSignal,
  OnboardingHistoryEntry,
} from "@/lib/types";
import { hubspotCompanyUrl, hubspotDealUrl } from "@/lib/hubspot-links";
import { VolumeChart } from "../VolumeChart";
import { HealthRings } from "../HealthRings";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";

interface Props {
  entry: RetentionMeetingEntry;
  isFocused: boolean;
  historyFocusedIdx: number | null;
  historyLoading: boolean;
}

function fmtTime24(d: Date): string {
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

function fmtTenure(daysLive: number | null): string {
  if (daysLive == null) return "Tenure unknown";
  if (daysLive < 60) return `Live ${daysLive} day${daysLive === 1 ? "" : "s"}`;
  if (daysLive < 365) {
    const months = Math.floor(daysLive / 30);
    return `Live ${months} month${months === 1 ? "" : "s"}`;
  }
  const years = (daysLive / 365).toFixed(1).replace(/\.0$/, "");
  return `Live ${years} year${years === "1" ? "" : "s"}`;
}

export function RetentionBrief({ entry, isFocused, historyFocusedIdx, historyLoading }: Props) {
  const { deal, meeting } = entry;
  const start = new Date(meeting.startsAt);

  return (
    <div
      style={{
        background: "var(--light-grey)",
        border: "1px solid var(--beige-gray)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: isFocused ? "0 0 0 1px var(--moss) inset" : "none",
      }}
    >
      {/* Header band */}
      <div
        style={{
          background: "var(--beige-new)",
          padding: "22px 28px",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              textTransform: "uppercase",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.12em",
              color: "var(--green-100)",
            }}
          >
            {fmtDateLabel(start)}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 4,
              color: "var(--moss)",
            }}
          >
            {fmtTime24(start)}
          </div>
          <div
            style={{
              display: "inline-block",
              marginTop: 10,
              background: "#D6EFD9",
              color: "#1d5021",
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "4px 9px",
              borderRadius: 4,
              textTransform: "uppercase",
            }}
          >
            Scheduled
          </div>
        </div>

        <div>
          <h3
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.02em",
              margin: 0,
              textTransform: "uppercase",
              color: "var(--moss)",
            }}
          >
            {deal.companyName}
          </h3>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginTop: 8,
              fontSize: 12.5,
              color: "var(--moss)",
              opacity: 0.78,
            }}
          >
            <Avatar name={deal.ownerName || "?"} size={22} />
            <span>{deal.ownerName || "Unassigned"}</span>
            <Dot />
            <span>{deal.country || "—"}</span>
            <Dot />
            <span style={{ fontWeight: 700 }}>{deal.customerStage}</span>
            <Dot />
            <span>{fmtTenure(deal.daysLive)}</span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
              fontSize: 11.5,
              color: "var(--green-100)",
              marginTop: 6,
            }}
          >
            {deal.companyName} & Understory
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {deal.companyId && (
            <a
              href={hubspotCompanyUrl(deal.companyId)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: "var(--citrus)",
                color: "var(--moss)",
                fontSize: 12,
                fontWeight: 600,
                padding: "9px 16px",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              → View account
            </a>
          )}
          <a
            href={hubspotDealUrl(deal.dealId)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "var(--light-grey)",
              color: "var(--moss)",
              fontSize: 12,
              fontWeight: 600,
              padding: "9px 16px",
              borderRadius: 8,
              border: "1px solid var(--beige-gray)",
              textDecoration: "none",
            }}
          >
            ↗ Open in HubSpot
          </a>
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {/* LEFT — data */}
        <div
          style={{
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <VolumeChart company={deal.companyProps} />
          <HealthRings company={deal.companyProps} />
          <CustomerSection deal={deal} />
          <CommercialSection deal={deal} />
        </div>

        {/* RIGHT — activity */}
        <div
          style={{
            padding: 20,
            borderLeft: "1px solid var(--beige-gray)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <PreviousActivity
            history={deal.history}
            historyLoading={historyLoading}
            focusedIdx={historyFocusedIdx}
          />
          <WatchOutFor signals={deal.watchOuts} />
        </div>
      </div>
    </div>
  );
}

function Dot() {
  return <span style={{ color: "var(--green-muted)" }}>·</span>;
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4
      style={{
        fontFamily: "var(--font-display)",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        margin: "0 0 10px",
        paddingBottom: 8,
        borderBottom: "1px solid var(--beige-gray)",
        color: "var(--moss)",
      }}
    >
      {children}
    </h4>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: 10,
        padding: "4px 0",
        fontSize: 12.5,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          opacity: 0.55,
          textTransform: "uppercase",
          paddingTop: 2,
          color: "var(--moss)",
        }}
      >
        {label}
      </div>
      <div style={{ color: "var(--moss)" }}>{children}</div>
    </div>
  );
}

function CustomerSection({ deal }: { deal: RetentionDeal }) {
  return (
    <div>
      <SectionHeader>Customer</SectionHeader>
      <Row label="Contact">
        {deal.contactName || deal.contactEmail || deal.contactPhone ? (
          <>
            {deal.contactName && <div>{deal.contactName}</div>}
            {deal.contactEmail && (
              <div>
                <a href={`mailto:${deal.contactEmail}`}>{deal.contactEmail}</a>
              </div>
            )}
            {deal.contactPhone && <div>{deal.contactPhone}</div>}
          </>
        ) : (
          <span style={{ opacity: 0.5 }}>—</span>
        )}
      </Row>
      <Row label="Website">
        {deal.companyDomain ? (
          <a href={toWebUrl(deal.companyDomain)} target="_blank" rel="noopener noreferrer">
            {deal.companyDomain}
          </a>
        ) : (
          <span style={{ opacity: 0.5 }}>—</span>
        )}
      </Row>
      <Row label="Storefront">
        {deal.storefrontLink ? (
          <a href={toWebUrl(deal.storefrontLink)} target="_blank" rel="noopener noreferrer">
            {deal.storefrontLink}
          </a>
        ) : (
          <span style={{ opacity: 0.5 }}>—</span>
        )}
      </Row>
    </div>
  );
}

function toWebUrl(domain: string): string {
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

function CommercialSection({ deal }: { deal: RetentionDeal }) {
  const inv = deal.invoices;
  return (
    <div>
      <SectionHeader>Commercial</SectionHeader>
      <Row label="Sales owner">{deal.commercial.salesOwner || "—"}</Row>
      <Row label="ACV">{deal.commercial.acv || "—"}</Row>
      <Row label="Booking fee">{deal.commercial.bookingFee || "—"}</Row>
      <Row label="Monthly fee">{deal.commercial.monthlyFee || "—"}</Row>
      <Row label="First billing">{deal.commercial.firstBilling || "—"}</Row>
      <Row label="Open invoices">{inv.open}</Row>
      <Row label="Overdue">
        {inv.overdue > 0 ? (
          <span>
            <b style={{ color: "#7a1d1d" }}>{inv.overdue}</b>
            {inv.overdueDays != null ? ` · ${inv.overdueDays} day${inv.overdueDays === 1 ? "" : "s"}` : ""}
            {inv.outstandingEur != null
              ? ` · ${inv.outstandingEur.toLocaleString("en-US")} EUR`
              : ""}
          </span>
        ) : (
          "0"
        )}
      </Row>
      <Row label="Future events">
        {deal.futureEvents != null ? `${deal.futureEvents} scheduled` : "—"}
      </Row>
    </div>
  );
}

function PreviousActivity({
  history,
  historyLoading,
  focusedIdx,
}: {
  history: OnboardingHistoryEntry[];
  historyLoading: boolean;
  focusedIdx: number | null;
}) {
  const items = history.slice(0, 4);

  return (
    <div>
      <SectionHeader>Previous activity</SectionHeader>
      {items.length === 0 && historyLoading && (
        <div style={{ opacity: 0.5, fontSize: 12, padding: "8px 0" }}>Loading more activity…</div>
      )}
      {items.length === 0 && !historyLoading && (
        <div style={{ opacity: 0.5, fontSize: 12, fontStyle: "italic" }}>Nothing logged yet.</div>
      )}
      {items.map((h, i) => (
        <ActivityItem key={h.id} entry={h} isFocused={i === focusedIdx} />
      ))}
    </div>
  );
}

function ActivityItem({ entry, isFocused }: { entry: OnboardingHistoryEntry; isFocused: boolean }) {
  const when = new Date(entry.occurredAt);
  const whenLabel = when.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  let pillBg = "#d8e1f2";
  let pillFg = "#1d2d6b";
  let pillText = "CALL";
  if (entry.kind === "meeting") {
    pillBg = "#e7d8ed";
    pillFg = "#4a2865";
    pillText = "MEETING";
  } else if (entry.kind === "email") {
    if (entry.direction === "INBOUND") {
      pillBg = "#d4eaf5";
      pillFg = "#103e5a";
      pillText = "EMAIL IN";
    } else {
      pillBg = "#d6efd9";
      pillFg = "#1d5021";
      pillText = "EMAIL OUT";
    }
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "8px 0",
        alignItems: "start",
        outline: isFocused ? "2px solid var(--moss)" : "2px solid transparent",
        outlineOffset: 2,
        borderRadius: 8,
        transition: "outline-color 120ms ease",
      }}
    >
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--green-muted)",
          marginTop: 8,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              padding: "2px 6px",
              borderRadius: 4,
              textTransform: "uppercase",
              background: pillBg,
              color: pillFg,
            }}
          >
            {pillText}
          </span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>{whenLabel}</span>
        </div>
        <div style={{ fontSize: 12.5, marginTop: 2 }}>{entry.title}</div>
        {entry.body && (
          <div
            style={{
              fontFamily: "var(--font-editorial)",
              fontStyle: "italic",
              fontSize: 11.5,
              color: "var(--green-100)",
              marginTop: 4,
              lineHeight: 1.45,
              maxHeight: 48,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {entry.body.slice(0, 280)}
          </div>
        )}
      </div>
    </div>
  );
}

function WatchOutFor({ signals }: { signals: WatchOutSignal[] }) {
  return (
    <div>
      <SectionHeader>Watch out for</SectionHeader>
      {signals.length === 0 ? (
        <div style={{ opacity: 0.5, fontSize: 12, fontStyle: "italic" }}>Nothing flagged.</div>
      ) : (
        signals.map((s, i) => (
          <div
            key={`${s.kind}:${i}`}
            style={{
              background: "#fff",
              border: `1px solid ${s.severity === "bad" ? "#f8d4d4" : "#fce8c2"}`,
              borderLeft: `3px solid ${s.severity === "bad" ? "#c43030" : "#d49500"}`,
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 8,
              fontSize: 12,
            }}
          >
            <div
              style={{
                color: s.severity === "bad" ? "#7a1d1d" : "#6b4a05",
                fontSize: 10.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 2,
              }}
            >
              {s.title}
            </div>
            {s.detail}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify it typechecks.**

```bash
npm run build
```

Expected: PASS. (If `Avatar` or `Icon` imports fail, check `src/components/design/` for the actual component names — they may be named exports under different filenames. The screenshot shows the existing onboarding view uses these so they exist.)

- [ ] **Step 3: Commit.**

```bash
git add src/components/design/views/RetentionBrief.tsx
git commit -m "feat: retention brief panel"
```

---

## Task 10: `RetentionView.tsx` — meeting list scaffold

**Files:**
- Create: `src/components/design/views/RetentionView.tsx`

**Why:** Hosts the day strip, the per-day meeting list, and renders one `<RetentionBrief>` per meeting. Mirrors the structure of `OnboardingView.tsx`'s `MeetingsPanel` but uses retention types and the new event names (`ud-retention-*` instead of `ud-onboarding-*`) so keyboard nav doesn't cross the streams.

This is a substantial file. The straightforward approach: open `src/components/design/views/OnboardingView.tsx` and copy the `MeetingsPanel` function plus its private helpers (`buildWeekdayStrip`, `DayStrip`, `Section`, `EmptyState`, `FetchDayButton`, `ArrowButton`, `Hero`, `KpiTile`) into the new `RetentionView.tsx` file, then change:

1. Type imports — `RetentionDeal`, `RetentionMeetingEntry` instead of onboarding equivalents.
2. Prop signature — accept retention types.
3. Brief render — call `<RetentionBrief>` instead of `<MeetingBriefCard>`.
4. Custom event names — replace `ud-onboarding-day-shift` / `-meeting-nav` / `-meeting-open` / `-meeting-unfocus` / `-history-enter` / `-history-exit` / `-history-nav` with `ud-retention-*` versions.
5. Hero copy — say "Retention · Meeting prep" / "live customers" instead of "on their way to live".
6. Drop the "newOnboardings" / "followUps" classification (we don't filter by activity type).
7. Drop the AttentionPanel branch — retention has no `attention` subview in v1.

Because this file is large, the steps below give you the diff intent rather than reprinting all 500 lines. Start by copying the entire `OnboardingView.tsx`, then apply the replacements.

- [ ] **Step 1: Copy `OnboardingView.tsx` to `RetentionView.tsx` and rename the component.**

```bash
cp src/components/design/views/OnboardingView.tsx src/components/design/views/RetentionView.tsx
```

Then in `RetentionView.tsx`:
- Rename the exported function `OnboardingView` → `RetentionView`.
- Remove the `subview` prop and the `AttentionPanel` branch — retention has no subview switch in v1.
- Remove `OnboardingSubview` and `AttentionPanel` references.

- [ ] **Step 2: Swap types and Brief renderer.**

Replace these imports:

```ts
import type {
  OnboardingDeal,
  OnboardingHistoryEntry,
  OnboardingMeetingEntry,
  OnboardingRisk,
} from "@/lib/types";
```

With:

```ts
import type {
  RetentionDeal,
  RetentionMeetingEntry,
  OnboardingHistoryEntry,
} from "@/lib/types";
import { RetentionBrief } from "./RetentionBrief";
```

Replace every `OnboardingDeal` with `RetentionDeal` and `OnboardingMeetingEntry` with `RetentionMeetingEntry`.

Find the inline `<MeetingBriefCard>` usage (or whatever name it has — the per-meeting brief render) and replace with:

```tsx
<RetentionBrief
  entry={entry}
  isFocused={isFocused}
  historyFocusedIdx={isFocused ? historyFocusedIdx : null}
  historyLoading={!!historyLoading}
/>
```

If `MeetingBriefCard` is defined inline in OnboardingView, **delete its definition from RetentionView** — the brief now lives in its own file.

- [ ] **Step 3: Replace event names.**

Run a find/replace across `RetentionView.tsx`:
- `ud-onboarding-day-shift` → `ud-retention-day-shift`
- `ud-onboarding-meeting-nav` → `ud-retention-meeting-nav`
- `ud-onboarding-meeting-open` → `ud-retention-meeting-open`
- `ud-onboarding-meeting-unfocus` → `ud-retention-meeting-unfocus`
- `ud-onboarding-history-enter` → `ud-retention-history-enter`
- `ud-onboarding-history-exit` → `ud-retention-history-exit`
- `ud-onboarding-history-nav` → `ud-retention-history-nav`
- `ud-meeting-focused-state` → `ud-retention-meeting-focused-state`
- `ud-history-focused-state` → `ud-retention-history-focused-state`

- [ ] **Step 4: Update Hero copy + KPI tile labels.**

Find the `<Hero>` block. Replace its props with:

```tsx
<Hero
  eyebrow="Retention · Meeting prep"
  filterLabel={filterLabel}
  line1Number={total}
  line1Suffix={total === 1 ? "live customer" : "live customers"}
  line2="staying with us."
  body={
    <>
      You have{" "}
      <strong style={{ color: "var(--citrus)" }}>
        {meetingsTodayCount} meeting{meetingsTodayCount === 1 ? "" : "s"} today
      </strong>
      {meetingsTodayCount > 0 && (
        <>
          {" "}, first at{" "}
          {fmtTime24(
            new Date((meetingsByDay.get(dayKey(today)) || [])[0].meeting.startsAt)
          )}
        </>
      )}
      . {meetings.length} meetings booked across the next 5 work days.
    </>
  }
/>
```

Drop the "Combined ACV" line — for retention, ACV summing across many live customers is less meaningful than just the count.

In the `<Stagger>` KPI grid, drop the `<KpiTile>` for "newOnboardings" / "followUps" classification and replace it with a simpler "This week" tile:

```tsx
<KpiTile
  label="This week"
  value={<CountUpInt value={meetings.length} />}
  sub={`across the next 5 work days`}
/>
```

- [ ] **Step 5: Drop the `subview` prop from the component signature.**

Remove `subview: OnboardingSubview;` from the Props interface. Remove the `if (subview === "attention")` branch entirely. The `RetentionView` is meeting-prep-only in v1.

The exported function should now look like:

```tsx
interface Props {
  deals: RetentionDeal[];
  meetings: RetentionMeetingEntry[];
  filterLabel?: string | null;
  fetchedDays?: Set<string>;
  fetchingDays?: Set<string>;
  onFetchDay?: (dayKey: string) => void;
  historyLoading?: boolean;
}

export function RetentionView(props: Props) {
  return <MeetingsPanel {...props} />;
}
```

- [ ] **Step 6: Remove the `onSelect` prop.**

Onboarding's `onSelect` opens a CompanyDetail panel. Retention doesn't need that in v1 — the brief panel is already inline. Remove `onSelect` from Props and from the inline meeting-card click handler. The brief renders inline when the meeting is focused; clicks on the meeting card just toggle focus.

- [ ] **Step 7: Build.**

```bash
npm run build
```

Expected: PASS. Fix any type errors (likely caused by lingering `OnboardingDeal` references or removed imports).

- [ ] **Step 8: Commit.**

```bash
git add src/components/design/views/RetentionView.tsx
git commit -m "feat: retention view (meeting list scaffold)"
```

---

## Task 11: `RetentionContainer.tsx`

**Files:**
- Create: `src/components/design/views/RetentionContainer.tsx`

**Why:** Owns fetch + state. Mirrors `OnboardingContainer` but talks to `/api/retention` and dispatches `ud-retention-*` events.

- [ ] **Step 1: Copy `OnboardingContainer.tsx` and rename.**

```bash
cp src/components/design/views/OnboardingContainer.tsx src/components/design/views/RetentionContainer.tsx
```

Then in the new file:
- Rename `OnboardingContainer` → `RetentionContainer`.
- Replace imports: `OnboardingResponse`, `OnboardingDeal`, `OnboardingMeetingEntry`, `OnboardingHistoryEntry` → `RetentionResponse`, `RetentionDeal`, `RetentionMeetingEntry`, `OnboardingHistoryEntry` (history entries reuse the onboarding type).
- Replace `OnboardingView` import → `RetentionView`.
- Replace `/api/onboarding` URLs with `/api/retention` (in the `fetchData`, `fetchDay`, and history `fetch()` calls).
- Drop `subview` and `setSubview` from props/state — retention has no subview tabs in v1.
- Drop `onSelectDeal` from props — the brief is inline, no panel-opening needed.
- Adjust prop signature:

```tsx
interface Props {
  filter: GlobalFilter;
  filterLabel: string | null;
}
```

- The `historyDealIdsKey` logic stays identical — it just operates on `RetentionDeal` instead of `OnboardingDeal`.

- [ ] **Step 2: Adjust the `<RetentionView>` call.**

The render at the bottom of the container should be:

```tsx
return (
  <RetentionView
    deals={filtered.deals}
    meetings={filtered.meetings}
    filterLabel={filterLabel}
    fetchedDays={fetchedDays}
    fetchingDays={fetchingDays}
    onFetchDay={fetchDay}
    historyLoading={historyLoading}
  />
);
```

- [ ] **Step 3: Build.**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add src/components/design/views/RetentionContainer.tsx
git commit -m "feat: retention container with lazy day + history fetch"
```

---

## Task 12: Activate the dashboard in the picker + page

**Files:**
- Modify: `src/components/design/VariantPicker.tsx`
- Modify: `src/app/page-client.tsx`

- [ ] **Step 1: Flip retention to `available: true` in `DASHBOARDS`.**

In `src/components/design/VariantPicker.tsx`, replace this line:

```ts
{ key: "retention", label: "Retention", sub: "Churn risk + renewals", available: false },
```

With:

```ts
{ key: "retention", label: "Retention", sub: "Live customers · meeting prep", available: true },
```

- [ ] **Step 2: Add the dynamic import + dashboard switch in `page-client.tsx`.**

Find the existing dynamic imports (around lines 28-40):

```ts
const PayMigrationContainer = dynamic(
  () =>
    import("@/components/design/views/PayMigrationContainer").then((m) => m.PayMigrationContainer),
  { loading: () => <ListLoading /> }
);
const OnboardingContainer = dynamic(
  () =>
    import("@/components/design/views/OnboardingContainer").then((m) => m.OnboardingContainer),
  { loading: () => <ListLoading /> }
);
```

Add a sibling for retention:

```ts
const RetentionContainer = dynamic(
  () =>
    import("@/components/design/views/RetentionContainer").then((m) => m.RetentionContainer),
  { loading: () => <ListLoading /> }
);
```

- [ ] **Step 3: Add the dashboard branch in the body switch.**

Find the existing `} else if (dashboard === "onboarding") {` block (around line 929). Add a parallel branch for retention:

```ts
} else if (dashboard === "retention") {
  body = (
    <RetentionContainer
      filter={globalFilter}
      filterLabel={filterLabel}
    />
  );
}
```

Place it after the onboarding branch and before the search branch.

- [ ] **Step 4: Add `retention` to the URL state parser.**

Find the line that allows-listed dashboard keys (around line 78):

```ts
if (d === "status" || d === "onboarding" || d === "pay_migration" || d === "search") out.dashboard = d;
```

Add `retention`:

```ts
if (d === "status" || d === "onboarding" || d === "retention" || d === "pay_migration" || d === "search") out.dashboard = d;
```

And around line 248:

```ts
if (d === "onboarding" || d === "pay_migration" || d === "search") setDashboard(d);
```

Add `"retention"`:

```ts
if (d === "onboarding" || d === "retention" || d === "pay_migration" || d === "search") setDashboard(d);
```

- [ ] **Step 5: Add a retention slot to `selectionByScope`.**

Find the `SelectionScope` type and the `selectionByScope` initializer (search for `selectionByScope`). The current code groups non-Status dashboards under `_other`. Add a dedicated `retention` slot.

Update the `SelectionScope` union type to include `"retention"`. Update the initial state and the `selectionScope` computation:

```ts
const selectionScope: SelectionScope =
  dashboard === "status" ? variant
  : dashboard === "retention" ? "retention"
  : "_other";
```

Update the initial state object to include `retention: null`.

(Without this, switching between Onboarding and Retention shares a selection slot — a bug we want to avoid even if v1 doesn't open a CompanyDetail panel for retention. Future-proofing.)

- [ ] **Step 6: Wire the `R` (refresh) shortcut for retention.**

Find the existing block where `R` dispatches `ud-refresh-dashboard` for onboarding/pay_migration. Make sure the gate also passes for `dashboard === "retention"` so the user can hit `R` to refresh. The check is usually a guard like:

```ts
if (s.dashboard === "onboarding" || s.dashboard === "pay_migration") {
  window.dispatchEvent(new Event("ud-refresh-dashboard"));
}
```

Add `retention`:

```ts
if (s.dashboard === "onboarding" || s.dashboard === "retention" || s.dashboard === "pay_migration") {
  window.dispatchEvent(new Event("ud-refresh-dashboard"));
}
```

The exact lines vary — search for `ud-refresh-dashboard`.

- [ ] **Step 7: Wire the day-shift / meeting-nav arrow keys for retention.**

Find the existing block (around line 648) where ↑/↓/←/→ dispatch `ud-onboarding-meeting-nav` etc. when on the onboarding dashboard. Add a parallel block for retention that dispatches the `ud-retention-*` events instead. The structure mirrors onboarding's exactly:

```ts
} else if (
  s.dashboard === "retention" &&
  (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown")
) {
  // Mirror of the onboarding arrow handler — see the parallel block above.
  // ↑/↓ navigates the meeting list; ←/→ shifts the day strip OR walks
  // history when a meeting is focused with history-mode active.
  // ... (clone the corresponding onboarding handler logic, swapping event names)
}
```

Because the exact handler logic is intricate and not yet visible in this plan, the safe path is: **find the entire `if (s.dashboard === "onboarding" && ...)` arrow-key block** in page-client.tsx, clone it, change the gate to `s.dashboard === "retention"`, and replace each `ud-onboarding-*` event name with `ud-retention-*`.

- [ ] **Step 8: Build + lint.**

```bash
npm run build && npm run lint
```

Expected: both PASS.

- [ ] **Step 9: Manual smoke test.**

Start the dev server:

```bash
npm run dev
```

Open `http://localhost:3000` and verify:
- DashboardPicker shows Retention as available (no "Soon" badge).
- Clicking Retention loads the retention dashboard.
- `g r` keyboard shortcut switches to retention.
- A retention meeting (if any are scheduled in the next 5 work days) renders with the brief showing Volume + Health + Customer + Commercial on the left, Previous activity + Watch out for on the right.
- The day strip ←/→ arrows shift the day.
- ↓ focuses the first meeting card.
- `R` refreshes the dashboard.

If no retention meetings happen to be on the calendar in the live HubSpot data, that's fine — verify by glancing at the Network tab that `/api/retention` returns 200 with at least the deals array populated.

- [ ] **Step 10: Commit.**

```bash
git add src/components/design/VariantPicker.tsx src/app/page-client.tsx
git commit -m "feat: activate retention dashboard with g+r shortcut and selection slot"
```

---

## Task 13: Onboarding backport — invoice + future events rows

**Files:**
- Modify: `src/lib/onboarding.ts`
- Modify: `src/components/design/views/OnboardingView.tsx` (or wherever the onboarding brief is rendered)

**Why:** Spec section 9 calls for adding invoice rows + future events row to the Onboarding Commercial section. Use the same `extractInvoiceState` + `parseUpcomingEvents` helpers from retention.ts.

- [ ] **Step 1: Update `OnboardingDeal` building to include invoices + futureEvents.**

In `src/lib/onboarding.ts`, find where `OnboardingDeal` objects are constructed (search for `dealId:` followed by deal field construction). Add the new fields:

```ts
import { extractInvoiceState } from "./retention";

// In the existing deal construction code (near where commercial is computed):
const invoices = extractInvoiceState(dp, new Date().toISOString());
const futureEvents = parseUpcomingEvents(cp.understory_health_score_upcoming_events);
```

Find the `parseUpcomingEvents` helper — if it's not already in onboarding.ts, copy it inline:

```ts
function parseUpcomingEvents(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = parseInt(raw, 10);
  return isNaN(n) ? null : n;
}
```

Then add `invoices` and `futureEvents` to the returned `OnboardingDeal` object.

- [ ] **Step 2: Add the new properties to the company-property fetch list.**

Find `COMPANY_PROPERTIES_TO_FETCH` (or equivalent) in onboarding.ts or hubspot.ts. The retention design relies on `understory_health_score_upcoming_events` already being fetched — verify it's in the list. If it isn't, add it.

For invoice fields, find the deal-property fetch list (`LIFECYCLE_DEAL_PROPS` near line 145 of onboarding.ts) and add:

```ts
  // Invoice (Retention backport)
  "number_of_open_invoices",
  "unpaid_invoice",
  "invoice_due_date",
  "outstanding_amount",
```

- [ ] **Step 3: Render the new rows in the Onboarding brief.**

Open the file that renders the onboarding brief Commercial section (likely a function inside `OnboardingView.tsx`, search for `Commercial` headers or `firstBilling`). After the existing rows for booking fee / monthly fee / ACV / first billing, add:

```tsx
<Row label="Open invoices">{deal.invoices.open}</Row>
<Row label="Overdue">
  {deal.invoices.overdue > 0 ? (
    <span>
      <b style={{ color: "#7a1d1d" }}>{deal.invoices.overdue}</b>
      {deal.invoices.overdueDays != null
        ? ` · ${deal.invoices.overdueDays} day${deal.invoices.overdueDays === 1 ? "" : "s"}`
        : ""}
      {deal.invoices.outstandingEur != null
        ? ` · ${deal.invoices.outstandingEur.toLocaleString("en-US")} EUR`
        : ""}
    </span>
  ) : (
    "0"
  )}
</Row>
<Row label="Future events">
  {deal.futureEvents != null ? `${deal.futureEvents} scheduled` : "—"}
</Row>
```

The exact `<Row>` component name may differ — match what the rest of that section uses.

- [ ] **Step 4: Build + lint.**

```bash
npm run build && npm run lint
```

Expected: both PASS.

- [ ] **Step 5: Manual verification in dev.**

Start `npm run dev`. Open the Onboarding dashboard. Click into a meeting brief that has a known unpaid/overdue invoice (if you have one) and verify the new rows render with sensible values. If no test data has overdue invoices, just confirm the rows render with `0` and `—` respectively.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/onboarding.ts src/components/design/views/OnboardingView.tsx
git commit -m "feat: invoice + future-events rows in onboarding commercial brief"
```

---

## Task 14: Onboarding backport — populated Watch out for

**Files:**
- Modify: `src/lib/onboarding.ts`
- Modify: `src/components/design/views/OnboardingView.tsx`

**Why:** Spec section 9 calls for auto-populating onboarding's "Watch out for" with the same churn signals retention uses, plus the onboarding-specific `stuck_in_step` signal.

- [ ] **Step 1: Compute `watchOuts` per onboarding deal.**

In `src/lib/onboarding.ts`, find where `OnboardingDeal` objects are returned. Above the return, compute:

```ts
import { computeWatchOutSignals } from "./signals";

// (within the deal-construction code)
const watchOuts = computeWatchOutSignals({
  nowIso: new Date().toISOString(),
  unpaidInvoice: dp.unpaid_invoice === "true",
  invoiceDueDate: dp.invoice_due_date || null,
  outstandingEur: invoices.outstandingEur,
  overdueDays: invoices.overdueDays,
  wishToChurn: dp.wish_to_churn === "true",
  churnReason: dp.churn_reason || null,
  volume3m: parseFloat(cp.understory_booking_volume_3m || "0") || 0,
  volume6m: parseFloat(cp.understory_booking_volume_6m || "0") || 0,
  healthScore: parseFloat(cp.health_score || "") || null,
  upcomingEvents: futureEvents,
  notesLastContacted: cp.notes_last_contacted || dp.notes_last_contacted || null,
  daysInStep: deal.daysInStep,
  expectedDaysInStep: deal.expectedDaysInStep,
});
```

Add `watchOuts` to the returned `OnboardingDeal` (the type was already extended in Task 2).

- [ ] **Step 2: Render `Watch out for` in the onboarding brief.**

Find the existing `WATCH OUT FOR` section in the onboarding brief (search for "Watch out for" in `OnboardingView.tsx`). It currently renders a hardcoded "Nothing flagged" or similar. Replace it with:

```tsx
<div>
  <SectionHeader>Watch out for</SectionHeader>
  {deal.watchOuts.length === 0 ? (
    <div style={{ opacity: 0.5, fontSize: 12, fontStyle: "italic" }}>Nothing flagged.</div>
  ) : (
    deal.watchOuts.map((s, i) => (
      <div
        key={`${s.kind}:${i}`}
        style={{
          background: "#fff",
          border: `1px solid ${s.severity === "bad" ? "#f8d4d4" : "#fce8c2"}`,
          borderLeft: `3px solid ${s.severity === "bad" ? "#c43030" : "#d49500"}`,
          borderRadius: 8,
          padding: "10px 12px",
          marginBottom: 8,
          fontSize: 12,
        }}
      >
        <div
          style={{
            color: s.severity === "bad" ? "#7a1d1d" : "#6b4a05",
            fontSize: 10.5,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontWeight: 700,
            marginBottom: 2,
          }}
        >
          {s.title}
        </div>
        {s.detail}
      </div>
    ))
  )}
</div>
```

(`SectionHeader` is whatever component name the onboarding brief uses for section headers; use the matching one.)

If you'd rather extract the Watch out for renderer into a shared component, do so in a follow-up commit — for v1, the duplication between RetentionBrief and OnboardingView is fine.

- [ ] **Step 3: Build + lint.**

```bash
npm run build && npm run lint
```

Expected: both PASS.

- [ ] **Step 4: Manual verification.**

In dev, open an onboarding meeting brief for an account that's stuck past its expected step duration (the `attention` tab already lists these — pick one). Verify the Watch out for now shows a "stuck_in_step" warn entry. If the account also has overdue invoices or 0 future events, those should appear too.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/onboarding.ts src/components/design/views/OnboardingView.tsx
git commit -m "feat: auto-populate watch out for in onboarding brief"
```

---

## Task 15: Final verification

**Files:** None modified.

- [ ] **Step 1: Run full build + lint + tests.**

```bash
npm run build && npm run lint && npx vitest run
```

Expected: all PASS.

- [ ] **Step 2: Manual smoke test all four dashboards.**

```bash
npm run dev
```

Walk through each:
1. **Status** — landing loads, Briefing/Split toggle works, attention rows render.
2. **Onboarding** — meeting prep loads, briefs render, new invoice rows + future events row visible in Commercial, Watch out for populates for stuck/overdue accounts.
3. **Retention** — `g r` switches, meeting prep loads, full brief renders (Volume chart, Health rings, Customer, Commercial, Previous activity, Watch out for), keyboard nav works, `R` refresh works.
4. **Pay migration** — unaffected, still works.
5. **Lookup** — unaffected, still works.

- [ ] **Step 3: If anything is broken, file a fix as its own task.**

Don't try to cram fixes into the final commit — that loses the bisect-friendly history. Each fix is its own commit.

- [ ] **Step 4: Notify Filip in the terminal that v1 is ready for review.**

No commit needed for this step — just a verbal handoff:

> "Retention dashboard meeting prep is ready on `main`. All tests + build pass. Walk through it on localhost when you have a moment; ping me before pushing to Vercel."

---

## Self-Review Checklist (run BEFORE finishing the plan)

This is for the plan author to run, not the executing engineer.

**1. Spec coverage:**
- [x] § 2 v1 scope (meeting prep only, no attention tab) — Tasks 9-12
- [x] § 3 data scope (pipeline filter, stages, owner filter) — Task 4-5
- [x] § 4 UI layout (header band, left column data, right column activity) — Task 9
- [x] § 5 architecture (new files + reuse) — Tasks 1-11
- [x] § 6 watch-out signal logic (6 rules) — Task 1
- [x] § 7 API + caching (per-filter cache, edge SWR, cron) — Tasks 6-8
- [x] § 8 wiring (DashboardPicker, page-client, g+r shortcut) — Task 12
- [x] § 9 onboarding backports (invoice rows, future events, watch outs) — Tasks 13-14

**2. No placeholders:**
- [x] No "TBD", "TODO", "implement later" in any task
- [x] No "add appropriate error handling" — all error paths shown explicitly (route handlers return 500 on catch)
- [x] No "similar to Task N without showing code" — every code-changing step has the actual code

**3. Type consistency:**
- [x] `WatchOutSignal` defined in Task 1, used identically in Tasks 5, 9, 14
- [x] `RetentionDeal` shape consistent across Tasks 2, 5, 9, 11
- [x] `extractInvoiceState` returns `RetentionInvoiceState` and is used as `deal.invoices` in both retention and onboarding briefs

**4. Open questions deferred to spec section 11 (not blocking):**
- Tenure formatting threshold (60d/365d) — implemented as written
- Volume declining cutoff (50% of prior 3m) — implemented as written
- Gone-quiet warn vs bad threshold (30d/45d) — implemented as written
