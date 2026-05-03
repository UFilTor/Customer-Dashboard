# Portfolio Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified Portfolio dashboard that lists every account in the user's filter scope as one row each, with stage-aware signal pills, multi-select signal filtering, and rich sort. Replaces planned Onboarding + Retention dashboards and supersedes Status as the primary triage view.

**Architecture:** New `/api/portfolio` edge route returns variant-agnostic rows. `PortfolioContainer.tsx` holds filter + sort + signal state and subscribes to keyboard events. `PortfolioView.tsx` renders a single dense table. Reuses the existing `Cache` + `getOrBuild` pattern, the `computeWatchOutSignals` per-row signal computer (with new stage applicability gating), and the existing global-filter primitives in `owners.ts`. Status stays accessible via `?d=status` during rollout.

**Tech Stack:** Next.js 16 (App Router, edge runtime), React 19, TypeScript, Vitest, inline styles using CSS custom properties (`var(--moss)` etc.). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-03-portfolio-dashboard-design.md`

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `src/lib/portfolio.ts` | Stage classification, stage applicability, sort key extractors, per-row builder, payload orchestrator |
| `src/lib/portfolio.test.ts` | Unit tests for pure functions: stage classification, sort keys, applicability gate |
| `src/app/api/portfolio/route.ts` | Edge route: cache + perf spans, mirrors `attention/route.ts` |
| `src/components/design/views/PortfolioContainer.tsx` | Fetch + filter + signal-filter + sort state, keyboard subscriptions, defaults persistence |
| `src/components/design/views/PortfolioView.tsx` | Presentation: dense table, signal pill row, sort menu, save-default link |

### Modified files

| Path | Change |
|---|---|
| `src/lib/types.ts` | Add `PortfolioStage`, `PortfolioSignalKey`, `PortfolioSortKey`, `PortfolioRow`, `PortfolioResponse`, `PortfolioDefaults`, `PortfolioSignalFilter` |
| `src/lib/signals.ts` | Flip `no_future_events` severity to bad, extend `SIGNALS` + `SECTION_ORDER` to 8 entries, add `STAGE_APPLICABILITY` map |
| `src/lib/signals.test.ts` | Update no_future_events severity assertion, add stage applicability cases |
| `src/lib/urgency.ts` | Extend `urgencyScore` to weight all 8 signals |
| `src/components/design/VariantPicker.tsx` | Add `portfolio` to `DashboardKey`, push into `DASHBOARDS` available; remove `onboarding` and `retention` placeholders |
| `src/app/page-client.tsx` | Register portfolio dashboard, signal-filter URL param, sort URL param, save-defaults handler, keyboard dispatches |
| `src/lib/prefetch.ts` | Add `prefetchPortfolio` (mirrors `prefetchAttention`) |
| `src/app/api/cron/warm/route.ts` | Add `/api/portfolio` global + per-region warmups |
| `src/components/ShortcutCheatSheet.tsx` | Add Portfolio block; remove retention/onboarding placeholders if any |

### Untouched

`src/lib/attention.ts`, `src/lib/attention-payload.ts`, `src/lib/onboarding.ts`, `src/lib/pay-migration.ts`, `src/lib/meeting-prep.ts`, all existing routes, all existing views. Status, Meeting prep, Pay migration, Lookup keep their current behavior.

---

## Task 1: Add types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the new types at the end of the file (after the `SearchTurn` interface).**

```ts
// Portfolio dashboard
//
// Source: union of Customer Lifecycle (166333631) + Customer Retention
// (1072518362) pipelines, all non-Churned customer_stage values. Each row is
// one company. Signals attached as decoration; stage applicability gates which
// signals can fire.

export type PortfolioStage =
  | "Onboarding"
  | "Adopted"
  | "Started"
  | "Ramp Up"
  | "Established";

export type PortfolioSignalKey =
  | "overdue_invoices"
  | "open_invoices"
  | "no_future_events"
  | "health_dropped"
  | "stuck_in_step"
  | "volume_declining"
  | "wish_to_churn"
  | "gone_quiet";

export type PortfolioSortKey =
  // Universal
  | "urgency"
  | "name"
  | "revenue"
  | "health"
  | "last_contact"
  | "days_in_stage"
  // Signal-specific
  | "oldest_outstanding"
  | "value_overdue"
  | "count_overdue"
  | "due_soonest"
  | "value_open"
  | "count_open"
  | "longest_silence_events"
  | "revenue_no_events"
  | "biggest_drop"
  | "current_score_asc"
  | "longest_stuck"
  | "days_past_expected"
  | "biggest_pct_drop"
  | "prior_3m_volume"
  | "wish_flagged_recent"
  | "longest_silence_quiet";

export interface PortfolioRow {
  id: string;
  name: string;
  domain: string | null;
  ownerId: string | null;
  ownerName: string | null;

  stage: PortfolioStage;
  daysInStage: number | null;
  customerLiveDate: string | null;

  revenue: number;
  healthScore: number | null;
  daysSinceContact: number | null;

  signals: WatchOutSignal[];

  // Signal-specific values surfaced for sort key extraction.
  // Null when the corresponding signal is not firing.
  overdueDays: number | null;       // days past due (positive); null when not overdue
  daysUntilDue: number | null;      // days until due (positive); null when not open or already overdue
  outstandingEur: number | null;
  openInvoiceCount: number | null;
  daysSilent: number | null;
  healthDrop: number | null;
  daysPastExpectedStep: number | null;
  volumeDropPct: number | null;
  prior3mVolume: number | null;
  wishToChurnAt: string | null;
}

export interface PortfolioResponse {
  rows: PortfolioRow[];
  generatedAt: string;
  totalsByStage: Record<PortfolioStage, number>;
  totalsBySignal: Record<PortfolioSignalKey, number>;
}

export interface PortfolioDefaults {
  filter: GlobalFilter;
  signals: PortfolioSignalKey[];
  sort: PortfolioSortKey;
}

// Multi-select signal filter state. Empty array means no signal filter.
export type PortfolioSignalFilter = PortfolioSignalKey[];
```

- [ ] **Step 2: Add the `GlobalFilter` import.**

`PortfolioDefaults` references `GlobalFilter` from `owners.ts`. Add the import at the top of `types.ts`:

```ts
import type { GlobalFilter } from "./owners";
```

- [ ] **Step 3: Run the typecheck and confirm clean.**

Run: `npx tsc --noEmit`
Expected: no errors. (If `owners.ts` is itself typed cleanly, this should pass.)

- [ ] **Step 4: Commit.**

```bash
git add src/lib/types.ts
git commit -m "feat(portfolio): add types for Portfolio dashboard rows + defaults"
```

---

## Task 2: PortfolioStage classification helper

**Files:**
- Modify: `src/lib/portfolio.ts` (create)
- Modify: `src/lib/portfolio.test.ts` (create)

- [ ] **Step 1: Write failing tests for stage classification.**

Create `src/lib/portfolio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyPortfolioStage } from "./portfolio";

describe("classifyPortfolioStage", () => {
  it("maps onboarding-flavored HubSpot values", () => {
    expect(classifyPortfolioStage("Onboarding", null)).toBe("Onboarding");
    expect(classifyPortfolioStage("Adopted", null)).toBe("Adopted");
    expect(classifyPortfolioStage("Started", null)).toBe("Started");
  });

  it("maps retention-flavored HubSpot values", () => {
    expect(classifyPortfolioStage("Ramp Up", null)).toBe("Ramp Up");
    expect(classifyPortfolioStage("Established", null)).toBe("Established");
  });

  it("falls back to Established for unknown stages so the row still appears", () => {
    expect(classifyPortfolioStage("", null)).toBe("Established");
    expect(classifyPortfolioStage("Some Future Stage", null)).toBe("Established");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.**

Run: `npx vitest run src/lib/portfolio.test.ts`
Expected: FAIL because `portfolio.ts` does not exist yet.

- [ ] **Step 3: Create `src/lib/portfolio.ts` with the minimal implementation.**

```ts
import type { PortfolioStage } from "./types";

// Maps HubSpot `customer_stage` to our 5-stage Portfolio union. Unknown
// values fall back to "Established" so the account still appears in the
// portfolio rather than being silently dropped.
export function classifyPortfolioStage(
  customerStage: string,
  _customerSubstage: string | null
): PortfolioStage {
  switch (customerStage) {
    case "Onboarding":
      return "Onboarding";
    case "Adopted":
      return "Adopted";
    case "Started":
      return "Started";
    case "Ramp Up":
      return "Ramp Up";
    case "Established":
      return "Established";
    default:
      return "Established";
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes.**

Run: `npx vitest run src/lib/portfolio.test.ts`
Expected: PASS, 1 file 3 tests.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/portfolio.ts src/lib/portfolio.test.ts
git commit -m "feat(portfolio): add stage classification helper"
```

> **Note on import organization:** Subsequent tasks (3, 5, 6, 7) all append more code to `src/lib/portfolio.ts`. Each task's code block shows the imports it needs. As you go, **consolidate all imports at the top of the file** (one `import { ... } from "./types"` line, etc.) rather than letting them scatter through the file. The function bodies stay where each task placed them; only the imports move up.

---

## Task 3: Signal taxonomy: severity flip + stage applicability

**Files:**
- Modify: `src/lib/signals.ts:17-22` (SIGNALS array)
- Modify: `src/lib/signals.ts:31-36` (SECTION_ORDER)
- Modify: `src/lib/signals.ts:183-190` (no_future_events severity)
- Modify: `src/lib/signals.test.ts` (update + add cases)
- Modify: `src/lib/portfolio.ts` (add STAGE_APPLICABILITY + isSignalApplicable)
- Modify: `src/lib/portfolio.test.ts` (applicability cases)

- [ ] **Step 1: Update existing `signals.test.ts` no_future_events case to expect bad severity.**

Find the test at `src/lib/signals.test.ts:78-87` and change the severity expectation:

```ts
  it("flags no_future_events only when upcomingEvents score is exactly 0", () => {
    const out = computeWatchOutSignals(ctx({ upcomingEvents: 0 }));
    expect(out[0]).toMatchObject({ kind: "no_future_events", severity: "bad" });
    // Score 0.20 = 1 event scheduled, must NOT fire
    const out020 = computeWatchOutSignals(ctx({ upcomingEvents: 0.2 }));
    expect(out020).toEqual([]);
    // Null = data missing, must NOT fire
    const outNull = computeWatchOutSignals(ctx({ upcomingEvents: null }));
    expect(outNull).toEqual([]);
  });
```

Also update the "orders by severity" test at line 101 to match the new ordering. After this change, an account with both a health drop (warn) and no future events (bad) puts no_future_events ahead of health_dropped:

```ts
  it("orders by severity (bad before warn) then by appearance", () => {
    const out = computeWatchOutSignals(ctx({
      healthScore: 50,                    // warn
      unpaidInvoice: true,                // bad
      invoiceDueDate: "2026-04-24T00:00:00.000Z",
      outstandingEur: 100,
      overdueDays: 8,
      upcomingEvents: 0,                  // bad (now)
    }));
    expect(out.map((s) => s.kind)).toEqual([
      "overdue_invoice",
      "no_future_events",
      "health_dropped",
    ]);
  });
```

- [ ] **Step 2: Run tests, expect failures.**

Run: `npx vitest run src/lib/signals.test.ts`
Expected: FAIL on the two updated tests because the implementation still emits warn.

- [ ] **Step 3: Flip `no_future_events` severity in `src/lib/signals.ts`.**

Find the block at `src/lib/signals.ts:181-191` (the `no_future_events` rule inside `computeWatchOutSignals`) and change `severity: "warn"` to `severity: "bad"`:

```ts
  if (ctx.upcomingEvents === 0) {
    out.push({
      kind: "no_future_events",
      severity: "bad",
      title: "No upcoming events",
      detail: "Storefront has nothing scheduled",
    });
  }
```

Also update the corresponding `SignalMeta` entry in `SIGNALS` at `src/lib/signals.ts:17-22` to mark it `urgent: true`:

```ts
export const SIGNALS: SignalMeta[] = [
  { key: "overdue_invoices", label: "Overdue invoices", short: "Overdue inv.", color: "#B84A2D", urgent: true },
  { key: "open_invoices", label: "Open invoices", short: "Open inv.", color: "#B8761F", urgent: false },
  { key: "no_future_events", label: "No future events", short: "No events", color: "#B84A2D", urgent: true },
  { key: "health_score", label: "Health decline", short: "Health drop", color: "#2F5C3E", urgent: false },
];
```

(Color now matches bad-severity family `#B84A2D`. `health_score` keeps its existing color; the new portfolio-specific signals are added in step 4.)

- [ ] **Step 4: Extend `SIGNALS` and `SECTION_ORDER` to 8 entries.**

Replace the `SIGNALS` array and `SECTION_ORDER` constant in `src/lib/signals.ts`. Note that the existing `AttentionSignal` type uses `health_score`, and `WatchOutSignalKind` uses `health_dropped`. We need a unified signal-key vocabulary that the Portfolio dashboard consumes. Rather than refactor the existing two types, introduce a Portfolio-side `PortfolioSignalMeta` array keyed on `PortfolioSignalKey` from `types.ts`, leaving `SIGNALS` (typed by `AttentionSignal`) untouched for the legacy Status dashboard:

Append to `src/lib/signals.ts`:

```ts
import type { PortfolioSignalKey } from "./types";

export interface PortfolioSignalMeta {
  key: PortfolioSignalKey;
  label: string;
  short: string;
  color: string;
  severity: "bad" | "warn";
}

// 8-signal taxonomy used by the Portfolio dashboard. Order is load-bearing:
// the keyboard 1-8 shortcut maps to this array index, and Daily-Brief-style
// section ordering renders bad-severity signals first within priority. See
// the spec at docs/superpowers/specs/2026-05-03-portfolio-dashboard-design.md.
export const PORTFOLIO_SIGNALS: PortfolioSignalMeta[] = [
  { key: "overdue_invoices",   label: "Overdue invoices",   short: "Overdue",     color: "#B84A2D", severity: "bad"  },
  { key: "wish_to_churn",      label: "Wish to churn",      short: "Wish churn",  color: "#B84A2D", severity: "bad"  },
  { key: "volume_declining",   label: "Volume declining",   short: "Vol. drop",   color: "#B84A2D", severity: "bad"  },
  { key: "no_future_events",   label: "No future events",   short: "No events",   color: "#B84A2D", severity: "bad"  },
  { key: "open_invoices",      label: "Open invoices",      short: "Open inv.",   color: "#B8761F", severity: "warn" },
  { key: "stuck_in_step",      label: "Stuck in step",      short: "Stuck",       color: "#B8761F", severity: "warn" },
  { key: "health_dropped",     label: "Health drop",        short: "Health",      color: "#2F5C3E", severity: "warn" },
  { key: "gone_quiet",         label: "Gone quiet",         short: "Quiet",       color: "#3D4E5F", severity: "warn" },
];

export const PORTFOLIO_SIGNAL_MAP: Record<PortfolioSignalKey, PortfolioSignalMeta> =
  Object.fromEntries(PORTFOLIO_SIGNALS.map((s) => [s.key, s])) as Record<
    PortfolioSignalKey,
    PortfolioSignalMeta
  >;

// Order keyboard 1-8 maps to. Identical to PORTFOLIO_SIGNALS' index sequence.
export const PORTFOLIO_SIGNAL_ORDER: PortfolioSignalKey[] = PORTFOLIO_SIGNALS.map((s) => s.key);
```

- [ ] **Step 5: Add stage applicability to `src/lib/portfolio.ts`.**

Append to `src/lib/portfolio.ts`:

```ts
import type { PortfolioSignalKey, PortfolioStage } from "./types";

// Which signals can fire for each stage. A signal is dropped from a row if
// the row's stage is not in its applicability set.
export const STAGE_APPLICABILITY: Record<PortfolioSignalKey, PortfolioStage[]> = {
  overdue_invoices:  ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  open_invoices:     ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  no_future_events:  ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  health_dropped:    ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  gone_quiet:        ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  wish_to_churn:     ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"],
  stuck_in_step:     ["Onboarding", "Adopted", "Started"],
  volume_declining:  ["Ramp Up", "Established"],
};

export function isSignalApplicable(signal: PortfolioSignalKey, stage: PortfolioStage): boolean {
  return STAGE_APPLICABILITY[signal].includes(stage);
}
```

- [ ] **Step 6: Add applicability tests to `src/lib/portfolio.test.ts`.**

Append:

```ts
import { isSignalApplicable } from "./portfolio";

describe("isSignalApplicable", () => {
  it("allows stuck_in_step only on Onboarding/Adopted/Started", () => {
    expect(isSignalApplicable("stuck_in_step", "Onboarding")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Adopted")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Started")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Ramp Up")).toBe(false);
    expect(isSignalApplicable("stuck_in_step", "Established")).toBe(false);
  });

  it("allows volume_declining only on Ramp Up + Established", () => {
    expect(isSignalApplicable("volume_declining", "Onboarding")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Adopted")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Started")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Ramp Up")).toBe(true);
    expect(isSignalApplicable("volume_declining", "Established")).toBe(true);
  });

  it("allows overdue_invoices on every stage", () => {
    for (const stage of ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"] as const) {
      expect(isSignalApplicable("overdue_invoices", stage)).toBe(true);
    }
  });
});
```

- [ ] **Step 7: Run all signal + portfolio tests, expect pass.**

Run: `npx vitest run src/lib/signals.test.ts src/lib/portfolio.test.ts`
Expected: PASS on all cases.

- [ ] **Step 8: Commit.**

```bash
git add src/lib/signals.ts src/lib/signals.test.ts src/lib/portfolio.ts src/lib/portfolio.test.ts
git commit -m "feat(portfolio): 8-signal taxonomy + stage applicability + no_future_events bad severity"
```

---

## Task 4: Urgency score extension

**Files:**
- Modify: `src/lib/urgency.ts`
- Create: `src/lib/urgency.test.ts`

- [ ] **Step 1: Write failing tests for the extended urgency score.**

Create `src/lib/urgency.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { urgencyScore } from "./urgency";
import type { AttentionCompany } from "./types";

function company(overrides: Partial<AttentionCompany & { signal?: string }> = {}) {
  return { id: "1", name: "x", detail: "", ...overrides };
}

describe("urgencyScore", () => {
  it("ranks an overdue invoice higher than a health drop at equal revenue", () => {
    const overdue = urgencyScore(company({ signal: "overdue_invoices", daysOverdue: 7, revenue: 10000 }));
    const health  = urgencyScore(company({ signal: "health_score", previousCategory: "80", healthScore: "50", revenue: 10000 }));
    expect(overdue).toBeGreaterThan(health);
  });

  it("ranks wish_to_churn highly", () => {
    const wish = urgencyScore(company({ signal: "wish_to_churn", revenue: 10000 }));
    const quiet = urgencyScore(company({ signal: "gone_quiet", daysSilent: 40, revenue: 10000 }));
    expect(wish).toBeGreaterThan(quiet);
  });

  it("ranks volume_declining higher than no_future_events at same revenue", () => {
    const decline = urgencyScore(company({ signal: "volume_declining", revenue: 10000 }));
    const events  = urgencyScore(company({ signal: "no_future_events", daysSilent: 0, revenue: 10000 }));
    expect(decline).toBeGreaterThan(events);
  });

  it("breaks ties by revenue", () => {
    const big    = urgencyScore(company({ signal: "stuck_in_step", revenue: 50000 }));
    const small  = urgencyScore(company({ signal: "stuck_in_step", revenue: 1000 }));
    expect(big).toBeGreaterThan(small);
  });
});
```

- [ ] **Step 2: Run tests, expect failure.**

Run: `npx vitest run src/lib/urgency.test.ts`
Expected: FAIL because the current `urgencyScore` does not weight `wish_to_churn`, `volume_declining`, `stuck_in_step`, or `no_future_events`.

- [ ] **Step 3: Replace `src/lib/urgency.ts` with the extended scorer.**

```ts
import type { AttentionCompany } from "./types";

// Urgency score for ranking accounts within and across signal groups.
// Weights mirror the spec at
// docs/superpowers/specs/2026-05-03-portfolio-dashboard-design.md:
// bad-severity signals score above warn-severity at equal revenue, with
// revenue as the universal tie-breaker. Designed for both the legacy Status
// dashboard and the new Portfolio dashboard.
export function urgencyScore(c: AttentionCompany & { signal?: string }): number {
  const rev = (c.revenue || 0) / 1000;

  // Bad-severity signals: score from a high base.
  if (c.signal === "overdue_invoices" || c.daysOverdue != null) {
    return (c.daysOverdue ?? 0) * 100 + 5000 + rev;
  }
  if (c.signal === "wish_to_churn") return 4500 + rev;
  if (c.signal === "volume_declining") return 4000 + rev;
  if (c.signal === "no_future_events") {
    // daysSilent for no_future_events tracks "days since last event", fold
    // it in linearly so accounts that have been quiet longer surface higher.
    return 3500 + (c.daysSilent ?? 0) * 2 + rev;
  }

  // Warn-severity signals.
  if (c.signal === "open_invoices") {
    return 2500 + (c.daysOverdue ?? 0) * 10 + rev;
  }
  if (c.signal === "stuck_in_step") return 2000 + rev;
  if (c.signal === "health_dropped" || c.signal === "health_score") {
    const prev = parseFloat(c.previousCategory || "0") || 0;
    const cur = parseFloat(c.healthScore || "0") || 0;
    const drop = (prev - cur) * 100;
    return 1500 + drop * 50 + rev;
  }
  if (c.signal === "gone_quiet" || c.daysSilent != null) {
    return 1000 + (c.daysSilent ?? 0) * 5 + rev;
  }

  // Healthy account: revenue only.
  return rev;
}
```

- [ ] **Step 4: Run tests, expect pass.**

Run: `npx vitest run src/lib/urgency.test.ts src/lib/signals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/urgency.ts src/lib/urgency.test.ts
git commit -m "feat(portfolio): extend urgencyScore for 8-signal taxonomy"
```

---

## Task 5: Sort key extractors

**Files:**
- Modify: `src/lib/portfolio.ts` (add `extractSortKey` + `getSortOptions`)
- Modify: `src/lib/portfolio.test.ts` (add cases)

- [ ] **Step 1: Write failing tests for sort key extraction.**

Append to `src/lib/portfolio.test.ts`:

```ts
import { extractSortKey, getSortOptions } from "./portfolio";
import type { PortfolioRow } from "./types";

function row(overrides: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    id: "1",
    name: "Example",
    domain: null,
    ownerId: null,
    ownerName: null,
    stage: "Established",
    daysInStage: null,
    customerLiveDate: null,
    revenue: 0,
    healthScore: null,
    daysSinceContact: null,
    signals: [],
    overdueDays: null,
    daysUntilDue: null,
    outstandingEur: null,
    openInvoiceCount: null,
    daysSilent: null,
    healthDrop: null,
    daysPastExpectedStep: null,
    volumeDropPct: null,
    prior3mVolume: null,
    wishToChurnAt: null,
    ...overrides,
  };
}

describe("extractSortKey", () => {
  it("returns universal values", () => {
    expect(extractSortKey(row({ revenue: 1234 }), "revenue")).toBe(1234);
    expect(extractSortKey(row({ healthScore: 55 }), "health")).toBe(55);
    expect(extractSortKey(row({ daysSinceContact: 12 }), "last_contact")).toBe(12);
    expect(extractSortKey(row({ name: "Acme" }), "name")).toBe("Acme");
  });

  it("returns null for signal-specific keys when signal is not firing", () => {
    expect(extractSortKey(row(), "oldest_outstanding")).toBeNull();
    expect(extractSortKey(row(), "biggest_pct_drop")).toBeNull();
  });

  it("returns signal-specific values when present", () => {
    expect(extractSortKey(row({ overdueDays: 14 }), "oldest_outstanding")).toBe(14);
    expect(extractSortKey(row({ outstandingEur: 5000 }), "value_overdue")).toBe(5000);
    expect(extractSortKey(row({ volumeDropPct: 0.7 }), "biggest_pct_drop")).toBe(0.7);
  });
});

describe("getSortOptions", () => {
  it("returns universal sorts when no signal is selected", () => {
    const opts = getSortOptions([]);
    const keys = opts.map((o) => o.key);
    expect(keys).toContain("urgency");
    expect(keys).toContain("revenue");
    expect(keys).not.toContain("oldest_outstanding");
  });

  it("adds signal-specific sorts when exactly one signal is selected", () => {
    const opts = getSortOptions(["overdue_invoices"]);
    const keys = opts.map((o) => o.key);
    expect(keys).toContain("urgency");
    expect(keys).toContain("oldest_outstanding");
    expect(keys).toContain("value_overdue");
    expect(keys).toContain("count_overdue");
  });

  it("omits signal-specific sorts when 2+ signals are selected", () => {
    const opts = getSortOptions(["overdue_invoices", "wish_to_churn"]);
    const keys = opts.map((o) => o.key);
    expect(keys).toContain("urgency");
    expect(keys).not.toContain("oldest_outstanding");
    expect(keys).not.toContain("wish_flagged_recent");
  });
});
```

- [ ] **Step 2: Run tests, expect failure.**

Run: `npx vitest run src/lib/portfolio.test.ts`
Expected: FAIL because `extractSortKey` and `getSortOptions` are not defined yet.

- [ ] **Step 3: Add `extractSortKey` and `getSortOptions` to `src/lib/portfolio.ts`.**

Append:

```ts
import type { PortfolioRow, PortfolioSortKey, PortfolioSignalKey } from "./types";

// Pure value extractor for a row + sort key. Returns null for signal-specific
// keys when the row is not firing that signal, sortByKey orders nulls to the
// bottom of either ascending or descending sorts so non-firing rows never
// outrank firing ones.
export function extractSortKey(row: PortfolioRow, key: PortfolioSortKey): number | string | null {
  switch (key) {
    // Universal
    case "urgency":         return row.signals.length * 10000 + row.revenue;
    case "name":            return row.name;
    case "revenue":         return row.revenue;
    case "health":          return row.healthScore;
    case "last_contact":    return row.daysSinceContact;
    case "days_in_stage":   return row.daysInStage;

    // Overdue invoices
    case "oldest_outstanding": return row.overdueDays;
    case "value_overdue":      return row.outstandingEur;
    case "count_overdue":      return row.openInvoiceCount;

    // Open invoices (overlaps fields with overdue, but the filter side limits scope)
    case "due_soonest":        return row.daysUntilDue;
    case "value_open":         return row.outstandingEur;
    case "count_open":         return row.openInvoiceCount;

    // No future events
    case "longest_silence_events": return row.daysSilent;
    case "revenue_no_events":      return row.revenue;

    // Health drop
    case "biggest_drop":        return row.healthDrop;
    case "current_score_asc":   return row.healthScore;

    // Stuck in step
    case "longest_stuck":       return row.daysInStage;
    case "days_past_expected":  return row.daysPastExpectedStep;

    // Volume declining
    case "biggest_pct_drop":    return row.volumeDropPct;
    case "prior_3m_volume":     return row.prior3mVolume;

    // Wish to churn
    case "wish_flagged_recent": return row.wishToChurnAt;

    // Gone quiet
    case "longest_silence_quiet": return row.daysSilent;
  }
}

export interface SortOption {
  key: PortfolioSortKey;
  label: string;
  /** Sort direction. "desc" puts higher values first. */
  direction: "asc" | "desc";
}

const UNIVERSAL_SORTS: SortOption[] = [
  { key: "urgency",       label: "Urgency",         direction: "desc" },
  { key: "name",          label: "Name (A-Z)",      direction: "asc"  },
  { key: "revenue",       label: "Revenue",         direction: "desc" },
  { key: "health",        label: "Health (worst first)", direction: "asc" },
  { key: "last_contact",  label: "Last contact (longest first)", direction: "desc" },
  { key: "days_in_stage", label: "Days in stage",   direction: "desc" },
];

const SIGNAL_SPECIFIC_SORTS: Record<PortfolioSignalKey, SortOption[]> = {
  overdue_invoices: [
    { key: "oldest_outstanding", label: "Oldest outstanding",  direction: "desc" },
    { key: "value_overdue",      label: "Value of overdue",    direction: "desc" },
    { key: "count_overdue",      label: "Number of invoices",  direction: "desc" },
  ],
  open_invoices: [
    { key: "due_soonest",  label: "Due soonest",  direction: "asc"  },
    { key: "value_open",   label: "Value",        direction: "desc" },
    { key: "count_open",   label: "Count",        direction: "desc" },
  ],
  no_future_events: [
    { key: "longest_silence_events", label: "Longest silence", direction: "desc" },
    { key: "revenue_no_events",      label: "Revenue",         direction: "desc" },
  ],
  health_dropped: [
    { key: "biggest_drop",      label: "Biggest drop",            direction: "desc" },
    { key: "current_score_asc", label: "Current score (worst first)", direction: "asc" },
  ],
  stuck_in_step: [
    { key: "longest_stuck",      label: "Longest stuck",        direction: "desc" },
    { key: "days_past_expected", label: "Days past expected",   direction: "desc" },
  ],
  volume_declining: [
    { key: "biggest_pct_drop", label: "Biggest % drop",   direction: "desc" },
    { key: "prior_3m_volume",  label: "Prior 3m volume",  direction: "desc" },
  ],
  wish_to_churn: [
    { key: "wish_flagged_recent", label: "Most recently flagged", direction: "desc" },
  ],
  gone_quiet: [
    { key: "longest_silence_quiet", label: "Longest silence", direction: "desc" },
  ],
};

// Returns the sort options to render in the dropdown given the active signal
// filter. With exactly one signal selected, the signal-specific sorts join
// the universals. With 0 or 2+ signals, only universals appear.
export function getSortOptions(selectedSignals: PortfolioSignalKey[]): SortOption[] {
  if (selectedSignals.length !== 1) return UNIVERSAL_SORTS;
  const specific = SIGNAL_SPECIFIC_SORTS[selectedSignals[0]] ?? [];
  return [...UNIVERSAL_SORTS, ...specific];
}
```

- [ ] **Step 4: Run tests, expect pass.**

Run: `npx vitest run src/lib/portfolio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/portfolio.ts src/lib/portfolio.test.ts
git commit -m "feat(portfolio): sort key extractors + signal-specific sort menu"
```

---

## Task 6: Row builder

**Files:**
- Modify: `src/lib/portfolio.ts` (add `buildRow`)
- Modify: `src/lib/portfolio.test.ts` (add cases)

- [ ] **Step 1: Write failing tests for `buildRow`.**

Append to `src/lib/portfolio.test.ts`:

```ts
import { buildRow } from "./portfolio";

const nowIso = "2026-05-03T00:00:00.000Z";

describe("buildRow", () => {
  const baseInput = {
    nowIso,
    company: {
      id: "100",
      name: "Acme",
      domain: "acme.com",
      ownerId: "1939229547",
      ownerName: "Filip",
      healthScore: null as number | null,
      revenue: 12000,
      notesLastContacted: null as string | null,
      volume3m: 0,
      volume6m: 0,
      upcomingEvents: 5 as number | null,
    },
    deal: {
      customerStage: "Established",
      customerSubstage: null as string | null,
      enteredStageDate: "2026-04-01T00:00:00.000Z",
      customerLiveDate: "2025-09-01T00:00:00.000Z",
      unpaidInvoice: false,
      invoiceDueDate: null as string | null,
      outstandingEur: null as number | null,
      overdueDays: null as number | null,
      daysUntilDue: null as number | null,
      openInvoiceCount: null as number | null,
      wishToChurn: false,
      churnReason: null as string | null,
      wishToChurnAt: null as string | null,
      daysInStep: null as number | null,
      expectedDaysInStep: null as number | null,
    },
  };

  it("collects no signals for a healthy row", () => {
    const r = buildRow(baseInput);
    expect(r.signals).toEqual([]);
    expect(r.stage).toBe("Established");
    expect(r.revenue).toBe(12000);
  });

  it("drops volume_declining on Onboarding stage even if data would fire it", () => {
    const r = buildRow({
      ...baseInput,
      company: { ...baseInput.company, volume3m: 1000, volume6m: 5000 },
      deal: { ...baseInput.deal, customerStage: "Onboarding" },
    });
    expect(r.signals.find((s) => s.kind === "volume_declining")).toBeUndefined();
  });

  it("drops stuck_in_step on Established stage even if days exceed expected", () => {
    const r = buildRow({
      ...baseInput,
      deal: { ...baseInput.deal, customerStage: "Established", daysInStep: 90, expectedDaysInStep: 30 },
    });
    expect(r.signals.find((s) => s.kind === "stuck_in_step")).toBeUndefined();
  });

  it("populates signal-specific sort fields when overdue invoice fires", () => {
    const r = buildRow({
      ...baseInput,
      deal: {
        ...baseInput.deal,
        unpaidInvoice: true,
        invoiceDueDate: "2026-04-20T00:00:00.000Z",
        outstandingEur: 4500,
        overdueDays: 13,
        openInvoiceCount: 2,
      },
    });
    expect(r.signals[0].kind).toBe("overdue_invoice");
    expect(r.overdueDays).toBe(13);
    expect(r.outstandingEur).toBe(4500);
    expect(r.openInvoiceCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests, expect failure.**

Run: `npx vitest run src/lib/portfolio.test.ts`
Expected: FAIL because `buildRow` is not defined.

- [ ] **Step 3: Add `buildRow` to `src/lib/portfolio.ts`.**

Append:

```ts
import { computeWatchOutSignals } from "./signals";
import type {
  PortfolioRow,
  PortfolioSignalKey,
  WatchOutSignal,
  WatchOutSignalKind,
} from "./types";

interface BuildRowInput {
  nowIso: string;
  company: {
    id: string;
    name: string;
    domain: string | null;
    ownerId: string | null;
    ownerName: string | null;
    healthScore: number | null;
    revenue: number;
    notesLastContacted: string | null;
    volume3m: number;
    volume6m: number;
    upcomingEvents: number | null;
  };
  deal: {
    customerStage: string;
    customerSubstage: string | null;
    enteredStageDate: string | null;
    customerLiveDate: string | null;
    unpaidInvoice: boolean;
    invoiceDueDate: string | null;
    outstandingEur: number | null;
    overdueDays: number | null;
    daysUntilDue: number | null;
    openInvoiceCount: number | null;
    wishToChurn: boolean;
    churnReason: string | null;
    wishToChurnAt: string | null;
    daysInStep: number | null;
    expectedDaysInStep: number | null;
  };
}

const SIGNAL_KIND_TO_KEY: Record<WatchOutSignalKind, PortfolioSignalKey> = {
  overdue_invoice: "overdue_invoices",
  wish_to_churn: "wish_to_churn",
  volume_declining: "volume_declining",
  health_dropped: "health_dropped",
  no_future_events: "no_future_events",
  gone_quiet: "gone_quiet",
  stuck_in_step: "stuck_in_step",
};

function daysBetween(now: string, then: string | null): number | null {
  if (!then) return null;
  const t = new Date(then).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((new Date(now).getTime() - t) / 86400000));
}

export function buildRow(input: BuildRowInput): PortfolioRow {
  const stage = classifyPortfolioStage(input.deal.customerStage, input.deal.customerSubstage);
  const daysSilent = daysBetween(input.nowIso, input.company.notesLastContacted);

  // Build the full watch-out list, then drop entries whose signal is not
  // applicable to this row's stage. open_invoices is not a WatchOutSignalKind
  // (it's an attention-only concept); we synthesize it from the same data.
  const computed = computeWatchOutSignals({
    nowIso: input.nowIso,
    unpaidInvoice: input.deal.unpaidInvoice,
    invoiceDueDate: input.deal.invoiceDueDate,
    outstandingEur: input.deal.outstandingEur,
    overdueDays: input.deal.overdueDays,
    wishToChurn: input.deal.wishToChurn,
    churnReason: input.deal.churnReason,
    volume3m: input.company.volume3m,
    volume6m: input.company.volume6m,
    healthScore: input.company.healthScore,
    upcomingEvents: input.company.upcomingEvents,
    notesLastContacted: input.company.notesLastContacted,
    daysInStep: input.deal.daysInStep,
    expectedDaysInStep: input.deal.expectedDaysInStep,
  });

  const applicable: WatchOutSignal[] = computed.filter((s) =>
    isSignalApplicable(SIGNAL_KIND_TO_KEY[s.kind], stage)
  );

  // open_invoices: exists only for Portfolio. Synthesized when there's an
  // open invoice that isn't overdue (overdue case is already covered by the
  // overdue_invoice WatchOut signal).
  const hasOpenNonOverdue =
    (input.deal.openInvoiceCount ?? 0) > 0 && !applicable.some((s) => s.kind === "overdue_invoice");
  if (hasOpenNonOverdue && isSignalApplicable("open_invoices", stage)) {
    applicable.push({
      kind: "overdue_invoice", // reuse kind union; severity differentiates
      severity: "warn",
      title: "Open invoice",
      detail: `${input.deal.openInvoiceCount} open invoice${input.deal.openInvoiceCount === 1 ? "" : "s"}`,
    });
  }

  const volumeDropPct =
    input.company.volume6m > 0 && input.company.volume3m < (input.company.volume6m - input.company.volume3m) * 0.5
      ? 1 - input.company.volume3m / Math.max(1, input.company.volume6m - input.company.volume3m)
      : null;

  const healthDrop =
    input.company.healthScore != null && input.company.healthScore < 60
      ? 60 - input.company.healthScore
      : null;

  const daysPastExpectedStep =
    input.deal.daysInStep != null && input.deal.expectedDaysInStep != null && input.deal.daysInStep > input.deal.expectedDaysInStep
      ? input.deal.daysInStep - input.deal.expectedDaysInStep
      : null;

  return {
    id: input.company.id,
    name: input.company.name,
    domain: input.company.domain,
    ownerId: input.company.ownerId,
    ownerName: input.company.ownerName,
    stage,
    daysInStage: daysBetween(input.nowIso, input.deal.enteredStageDate),
    customerLiveDate: input.deal.customerLiveDate,
    revenue: input.company.revenue,
    healthScore: input.company.healthScore,
    daysSinceContact: daysSilent,
    signals: applicable,
    overdueDays: input.deal.overdueDays,
    daysUntilDue: input.deal.daysUntilDue,
    outstandingEur: input.deal.outstandingEur,
    openInvoiceCount: input.deal.openInvoiceCount,
    daysSilent,
    healthDrop,
    daysPastExpectedStep,
    volumeDropPct,
    prior3mVolume: Math.max(0, input.company.volume6m - input.company.volume3m) || null,
    wishToChurnAt: input.deal.wishToChurnAt,
  };
}
```

- [ ] **Step 4: Run tests, expect pass.**

Run: `npx vitest run src/lib/portfolio.test.ts`
Expected: PASS on all `buildRow` cases.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/portfolio.ts src/lib/portfolio.test.ts
git commit -m "feat(portfolio): per-row builder with stage-applicability gating"
```

---

## Task 7: Payload orchestrator

**Files:**
- Modify: `src/lib/portfolio.ts` (add `buildPortfolioPayload`)
- Reference patterns from: `src/lib/attention.ts`, `src/lib/attention-payload.ts`, `src/lib/onboarding.ts:200-500`

This task wires `buildRow` to live HubSpot data. It mirrors `attention.ts`'s fetch shape, pipeline-scoped deal search, batch v4 association lookup, batch company-properties read, but for the entire customer-stage universe rather than a per-signal slice.

- [ ] **Step 1: Add the cache + payload function signature.**

Append to `src/lib/portfolio.ts`:

```ts
import { Cache } from "./cache";
import type { PortfolioResponse, PortfolioStage } from "./types";

const portfolioCache = new Cache<PortfolioResponse>(15 * 60 * 1000);

export function getCachedPortfolio(key: string): PortfolioResponse | null {
  return portfolioCache.get(key);
}

export async function buildPortfolioPayload(
  ownerIdsCsv: string | null,
  options: { refresh?: boolean } = {}
): Promise<PortfolioResponse> {
  const cacheKey = `portfolio:${ownerIdsCsv ?? "all"}`;
  if (!options.refresh) {
    const cached = portfolioCache.get(cacheKey);
    if (cached) return cached;
  }
  return portfolioCache.getOrBuild(cacheKey, async () => {
    const rows = await fetchPortfolioRows(ownerIdsCsv);
    return aggregatePayload(rows);
  });
}
```

- [ ] **Step 2: Add the deal/company universe fetcher.**

Append `fetchPortfolioRows` to `src/lib/portfolio.ts`. This function follows the same shape as `fetchNoFutureEvents` (`src/lib/attention.ts:432-560`) but pulls *all* active customer-stage deals instead of just zero-event ones. Key requirements (each is enforced by an existing pattern in the codebase, copy don't re-invent):

- Query both pipelines (`166333631` lifecycle + `1072518362` retention) via `crm/v3/objects/deals/search` with paging.
- **Always pass `sorts: [{ propertyName: "createdate", direction: "DESCENDING" }]`**, search pagination silently truncates without it (see AGENTS.md and `pay-migration.ts:searchDealsPage`).
- Use `crm/v4/associations/deals/companies/batch/read` for the deal -> company link (100 IDs per batch, parallelized with `Promise.all`).
- Use `crm/v3/objects/companies/batch/read` for company props (100 IDs per batch).
- Required deal properties: `customer_stage`, `customer_substage`, `customer_live_date`, `hs_v2_date_entered_current_stage`, `unpaid_invoice`, `invoice_due_date`, `outstanding_amount`, `number_of_open_invoices`, `wish_to_churn`, `churn_reason`, `dealstage`, `pipeline`, `confirmed__contract_mrr`, `deal_currency_code`, `booking_fee`, `confirmed_booking_fee`.
- Required company properties: `name`, `domain`, `hubspot_owner_id`, `health_score`, `understory_booking_volume_12m`, `understory_booking_volume_3m`, `understory_booking_volume_6m`, `understory_health_score_upcoming_events`, `notes_last_contacted`, `createdate`.
- Apply the `ownerIdsCsv` filter at the company level (after batch read). If `ownerIdsCsv` is null, skip filtering.
- For wish_to_churn timestamp, use `hs_lastmodifieddate` of the deal as a coarse proxy (HubSpot doesn't expose a per-property change time on the standard object; the existing churn-risk path in `attention.ts` doesn't show one either).
- Compute `revenue` using `computeGeneratedRevenue` from `attention.ts`, re-export that helper or inline the same formula. Recommended: **export it from `attention.ts`** (replace `function` with `export function` in `attention.ts:78`), then `import { computeGeneratedRevenue } from "./attention"` here.

Skeleton:

```ts
async function fetchPortfolioRows(ownerIdsCsv: string | null): Promise<PortfolioRow[]> {
  const nowIso = new Date().toISOString();
  // 1. Search both pipelines for all active customer-stage deals.
  // 2. Batch-read deal->company associations.
  // 3. Batch-read company props.
  // 4. Apply ownerIds filter on company.hubspot_owner_id.
  // 5. For each surviving (deal, company) pair, transform to BuildRowInput
  //    and call buildRow.
  // 6. Return the row list (sort happens client-side).
}
```

Use `searchDealsPage` from `src/lib/pay-migration.ts:31-95` as the canonical retry-aware search helper (extract it to a shared module or copy its retry logic, the spec notes `searchDealsPage` is the canonical pattern). Set `dealstageNotIn: ["Churned"]` semantics by filtering returned deals to those where `customer_stage !== "Churned"`.

The full implementation is ~100 lines and mirrors `fetchNoFutureEvents` step-by-step (steps 1-5 in that function). Read that file first, then write the equivalent here without the upcoming-events filter.

- [ ] **Step 3: Add the aggregator.**

Append:

```ts
function aggregatePayload(rows: PortfolioRow[]): PortfolioResponse {
  const totalsByStage: Record<PortfolioStage, number> = {
    Onboarding: 0, Adopted: 0, Started: 0, "Ramp Up": 0, Established: 0,
  };
  const totalsBySignal: Record<PortfolioSignalKey, number> = {
    overdue_invoices: 0, open_invoices: 0, no_future_events: 0, health_dropped: 0,
    stuck_in_step: 0, volume_declining: 0, wish_to_churn: 0, gone_quiet: 0,
  };

  for (const r of rows) {
    totalsByStage[r.stage] += 1;
    for (const s of r.signals) {
      const key = SIGNAL_KIND_TO_KEY[s.kind];
      // Both severities of gone_quiet collapse to one count; same for the
      // synthesized open_invoices entry.
      if (s.title === "Open invoice") {
        totalsBySignal.open_invoices += 1;
      } else {
        totalsBySignal[key] += 1;
      }
    }
  }

  return {
    rows,
    generatedAt: new Date().toISOString(),
    totalsByStage,
    totalsBySignal,
  };
}
```

- [ ] **Step 4: Add a smoke test that exercises `aggregatePayload` and confirms totals add up.**

Append to `src/lib/portfolio.test.ts`:

```ts
import { buildPortfolioPayload } from "./portfolio";
// (We can't easily test the live fetch path without a mock HubSpot. Instead,
// import the internal aggregator via a re-export below, or refactor to expose
// it as a named export.)
```

If `aggregatePayload` is module-internal, re-export it for testing:

```ts
// in portfolio.ts, near the bottom
export const __test = { aggregatePayload };
```

Then test:

```ts
import { __test } from "./portfolio";
const { aggregatePayload } = __test;

it("aggregatePayload counts stages and signals correctly", () => {
  const rows: PortfolioRow[] = [
    row({ stage: "Onboarding", signals: [{ kind: "stuck_in_step", severity: "warn", title: "x", detail: "y" }] }),
    row({ stage: "Established", signals: [{ kind: "overdue_invoice", severity: "bad", title: "x", detail: "y" }] }),
    row({ stage: "Established", signals: [] }),
  ];
  const out = aggregatePayload(rows);
  expect(out.totalsByStage.Onboarding).toBe(1);
  expect(out.totalsByStage.Established).toBe(2);
  expect(out.totalsBySignal.stuck_in_step).toBe(1);
  expect(out.totalsBySignal.overdue_invoices).toBe(1);
});
```

- [ ] **Step 5: Run tests, expect pass.**

Run: `npx vitest run src/lib/portfolio.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/portfolio.ts src/lib/portfolio.test.ts src/lib/attention.ts
git commit -m "feat(portfolio): payload orchestrator + universe fetch + aggregation"
```

---

## Task 8: API route

**Files:**
- Create: `src/app/api/portfolio/route.ts`

- [ ] **Step 1: Create the route file by copy-adapting `src/app/api/attention/route.ts`.**

```ts
import { NextRequest, NextResponse } from "next/server";
import { buildPortfolioPayload, getCachedPortfolio } from "@/lib/portfolio";
import { createSpans, logSpans, serverTimingHeader, withTiming } from "@/lib/perf";

// Edge runtime, same rationale as /api/attention. Per-edge-instance cache
// is warmed by the 14-min cron, with s-maxage=840 covering cross-instance.
export const runtime = "edge";

export async function GET(request: NextRequest) {
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const ownerIdsCsv = request.nextUrl.searchParams.get("ownerIds");
  const cacheKey = `portfolio:${ownerIdsCsv ?? "all"}`;
  const spans = createSpans();
  const cacheControl = refresh
    ? "private, no-cache, no-store, max-age=0, must-revalidate"
    : "public, s-maxage=840, stale-while-revalidate=60";

  if (!refresh) {
    const cached = getCachedPortfolio(cacheKey);
    if (cached) {
      spans.push({ label: "cache.hit", ms: 0 });
      logSpans("portfolio", spans);
      return NextResponse.json(cached, {
        headers: {
          "Server-Timing": serverTimingHeader(spans),
          "Cache-Control": cacheControl,
        },
      });
    }
  }

  try {
    const response = await withTiming(spans, "build", () =>
      buildPortfolioPayload(ownerIdsCsv, { refresh })
    );
    logSpans("portfolio", spans);
    return NextResponse.json(response, {
      headers: {
        "Server-Timing": serverTimingHeader(spans),
        "Cache-Control": cacheControl,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Could not load portfolio data" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Boot the dev server and hit the route.**

Run: `npm run dev` (let it boot). Then in another terminal: `curl -s http://localhost:3000/api/portfolio | head -c 500`
Expected: a JSON payload starting with `{"rows":[...`. If you see `{"error":"..."}`, check HubSpot env vars are set. Stop the dev server when done.

- [ ] **Step 3: Commit.**

```bash
git add src/app/api/portfolio/route.ts
git commit -m "feat(portfolio): /api/portfolio route"
```

---

## Task 9: Prefetch helper + cron warming

**Files:**
- Modify: `src/lib/prefetch.ts` (add `prefetchPortfolio`)
- Modify: `src/app/api/cron/warm/route.ts` (add portfolio targets)

- [ ] **Step 1: Add `prefetchPortfolio` to `src/lib/prefetch.ts`.**

After `prefetchAttention` (`src/lib/prefetch.ts:31-33`), append:

```ts
export function prefetchPortfolio(ownerIdsCsv?: string | null): void {
  const url =
    ownerIdsCsv && ownerIdsCsv !== "all"
      ? `/api/portfolio?ownerIds=${ownerIdsCsv}`
      : "/api/portfolio";
  fire(url);
  void import("@/components/design/views/PortfolioContainer");
}
```

- [ ] **Step 2: Add portfolio warm targets to `src/app/api/cron/warm/route.ts`.**

In the `targets` array (`src/app/api/cron/warm/route.ts:44-61`), add:

```ts
    "/api/portfolio?refresh=true",
    `/api/portfolio?refresh=true&ownerIds=${ownerIdsForRegion("DK")}`,
    `/api/portfolio?refresh=true&ownerIds=${ownerIdsForRegion("SE")}`,
    `/api/portfolio?refresh=true&ownerIds=${ownerIdsForRegion("IT")}`,
```

- [ ] **Step 3: Verify the build still passes.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add src/lib/prefetch.ts src/app/api/cron/warm/route.ts
git commit -m "feat(portfolio): prefetch + cron warm coverage"
```

---

## Task 10: PortfolioView (presentation)

**Files:**
- Create: `src/components/design/views/PortfolioView.tsx`

- [ ] **Step 1: Create the file with the table layout.**

The view is presentational. It receives data and event handlers from the container. Match the inline-styles + CSS-vars convention. Reference `src/components/design/views/SplitView.tsx` and `BriefingView.tsx` for visual conventions (row spacing, separator color, pill styles).

```tsx
"use client";

import type { PortfolioRow, PortfolioSignalKey, PortfolioSortKey } from "@/lib/types";
import { PORTFOLIO_SIGNALS, PORTFOLIO_SIGNAL_MAP } from "@/lib/signals";
import { getSortOptions } from "@/lib/portfolio";

interface Props {
  rows: PortfolioRow[];
  totalsBySignal: Record<PortfolioSignalKey, number>;

  selectedSignals: PortfolioSignalKey[];
  toggleSignal: (key: PortfolioSignalKey) => void;
  clearSignals: () => void;

  sortKey: PortfolioSortKey;
  setSortKey: (k: PortfolioSortKey) => void;

  focusedRowIndex: number | null;
  onRowClick: (row: PortfolioRow) => void;

  hasSavedDefault: boolean;
  defaultsAreCurrent: boolean;
  onSaveDefaults: () => void;
  onResetDefaults: () => void;
}

const STAGE_BADGE: Record<PortfolioRow["stage"], { bg: string; fg: string }> = {
  Onboarding:   { bg: "#FCE9C2", fg: "#7A4A00" },
  Adopted:      { bg: "#FFE2C2", fg: "#7A3F00" },
  Started:      { bg: "#FFE6E0", fg: "#8B2A14" },
  "Ramp Up":    { bg: "#D7E9D2", fg: "#1F4A22" },
  Established:  { bg: "#D5DFCA", fg: "#022C12" },
};

export function PortfolioView(props: Props) {
  const sortOptions = getSortOptions(props.selectedSignals);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filter pill row */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {PORTFOLIO_SIGNALS.map((meta) => {
          const active = props.selectedSignals.includes(meta.key);
          const count = props.totalsBySignal[meta.key] ?? 0;
          return (
            <button
              key={meta.key}
              onClick={() => props.toggleSignal(meta.key)}
              style={{
                padding: "4px 10px",
                borderRadius: 999,
                border: `1px solid ${meta.color}`,
                background: active ? meta.color : "transparent",
                color: active ? "#fff" : meta.color,
                font: "inherit",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {meta.label} · {count}
            </button>
          );
        })}
        {props.selectedSignals.length > 0 && (
          <button
            onClick={props.clearSignals}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid var(--text-muted, #6e6e6e)",
              background: "transparent",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Sort + defaults bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          Sort
          <select
            value={props.sortKey}
            onChange={(e) => props.setSortKey(e.target.value as PortfolioSortKey)}
            style={{ padding: "4px 8px", border: "1px solid var(--moss, #022C12)", borderRadius: 8 }}
          >
            {sortOptions.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
          <button onClick={props.onSaveDefaults} style={linkButtonStyle}>
            Save as default
          </button>
          {props.hasSavedDefault && !props.defaultsAreCurrent && (
            <button onClick={props.onResetDefaults} style={linkButtonStyle}>
              Reset to defaults
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div role="list" style={{ borderTop: "1px solid var(--separator, #e5e5e5)" }}>
        {props.rows.map((row, i) => {
          const focused = props.focusedRowIndex === i;
          return (
            <PortfolioRowItem
              key={row.id}
              row={row}
              focused={focused}
              onClick={() => props.onRowClick(row)}
            />
          );
        })}
        {props.rows.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted, #6e6e6e)" }}>
            No accounts match the current filter.
          </div>
        )}
      </div>
    </div>
  );
}

function PortfolioRowItem({
  row,
  focused,
  onClick,
}: {
  row: PortfolioRow;
  focused: boolean;
  onClick: () => void;
}) {
  const visiblePills = row.signals.slice(0, 3);
  const overflowCount = Math.max(0, row.signals.length - 3);
  const stage = STAGE_BADGE[row.stage];
  const healthColor =
    row.healthScore == null ? "#6e6e6e"
    : row.healthScore >= 80 ? "#1F4A22"
    : row.healthScore >= 60 ? "#7A4A00"
    : row.healthScore >= 40 ? "#8B5A14"
    : "#8B2A14";

  return (
    <div
      role="listitem"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto auto auto auto",
        gap: 12,
        alignItems: "center",
        padding: "10px 12px",
        borderBottom: "1px solid var(--separator, #e5e5e5)",
        background: focused ? "rgba(241, 249, 126, 0.25)" : "transparent",
        cursor: "pointer",
        font: "inherit",
        fontSize: 14,
      }}
    >
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 6,
          background: stage.bg,
          color: stage.fg,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.2,
        }}
      >
        {row.stage}
      </span>
      <span style={{ fontWeight: 600 }}>{row.name}</span>
      <span style={{ display: "flex", gap: 4 }}>
        {visiblePills.map((s, i) => {
          // Map WatchOutSignalKind back to PortfolioSignalMeta for color
          const meta = mapKindToMeta(s.kind, s.title);
          return (
            <span
              key={i}
              title={s.detail}
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                background: `${meta.color}1a`,
                color: meta.color,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {meta.short}
            </span>
          );
        })}
        {overflowCount > 0 && (
          <span style={{ fontSize: 11, color: "var(--text-muted, #6e6e6e)" }}>
            +{overflowCount}
          </span>
        )}
      </span>
      <span style={{ color: healthColor, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>
        {row.healthScore ?? "-"}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 80, textAlign: "right" }}>
        {row.revenue ? `€${formatNum(row.revenue)}` : "-"}
      </span>
      <span style={{ color: "var(--text-muted, #6e6e6e)", minWidth: 36, textAlign: "right" }}>
        {row.daysSinceContact == null ? "-" : `${row.daysSinceContact}d`}
      </span>
      <span style={{ color: "var(--text-muted, #6e6e6e)" }}>
        {row.ownerName ?? "-"}
      </span>
    </div>
  );
}

function mapKindToMeta(kind: string, title: string) {
  // The synthesized open-invoice entry uses kind="overdue_invoice" but title
  // "Open invoice", distinguish visually so users see the warn color.
  if (title === "Open invoice") return PORTFOLIO_SIGNAL_MAP.open_invoices;
  switch (kind) {
    case "overdue_invoice":   return PORTFOLIO_SIGNAL_MAP.overdue_invoices;
    case "wish_to_churn":     return PORTFOLIO_SIGNAL_MAP.wish_to_churn;
    case "volume_declining":  return PORTFOLIO_SIGNAL_MAP.volume_declining;
    case "no_future_events":  return PORTFOLIO_SIGNAL_MAP.no_future_events;
    case "stuck_in_step":     return PORTFOLIO_SIGNAL_MAP.stuck_in_step;
    case "health_dropped":    return PORTFOLIO_SIGNAL_MAP.health_dropped;
    case "gone_quiet":        return PORTFOLIO_SIGNAL_MAP.gone_quiet;
    default:                  return PORTFOLIO_SIGNAL_MAP.gone_quiet;
  }
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
}

const linkButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--moss, #022C12)",
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
  padding: 0,
};
```

- [ ] **Step 2: Verify it typechecks.**

Run: `npx tsc --noEmit`
Expected: no errors. (Imports for `React.CSSProperties` are implicit in TSX. If `react` import is missing for the CSSProperties type, add `import type { CSSProperties } from "react";` and use that.)

- [ ] **Step 3: Commit.**

```bash
git add src/components/design/views/PortfolioView.tsx
git commit -m "feat(portfolio): PortfolioView presentation (table layout)"
```

---

## Task 11: PortfolioContainer (state + fetch)

**Files:**
- Create: `src/components/design/views/PortfolioContainer.tsx`

- [ ] **Step 1: Create the container.**

The container holds: the fetched data, the current sort, the current signal filter, the focused row index. It subscribes to keyboard events dispatched by `page-client.tsx` and persists/loads defaults via localStorage. Mirror `OnboardingContainer.tsx`'s fetch + revalidate pattern.

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  PortfolioResponse,
  PortfolioRow,
  PortfolioDefaults,
  PortfolioSignalKey,
  PortfolioSortKey,
} from "@/lib/types";
import { effectiveOwnerIds, type GlobalFilter, parseFilter, serializeFilter } from "@/lib/owners";
import { apiFetch, friendlyErrorMessage } from "@/lib/api-fetch";
import { extractSortKey, getSortOptions } from "@/lib/portfolio";
import { PORTFOLIO_SIGNAL_MAP, PORTFOLIO_SIGNAL_ORDER } from "@/lib/signals";
import { PortfolioView } from "./PortfolioView";

interface Props {
  filter: GlobalFilter;
  filterLabel: string | null;
  onSelectCompany: (companyId: string) => void;
}

const DEFAULTS_KEY = "ud-v2-portfolio-default";

function filterKey(filter: GlobalFilter): string {
  const ids = effectiveOwnerIds(filter);
  if (!ids) return "all";
  return [...ids].sort().join(",");
}

function loadDefaults(): PortfolioDefaults | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const f = parseFilter(JSON.stringify(parsed.filter));
    if (!f) return null;
    if (!Array.isArray(parsed.signals)) return null;
    if (typeof parsed.sort !== "string") return null;
    return { filter: f, signals: parsed.signals as PortfolioSignalKey[], sort: parsed.sort as PortfolioSortKey };
  } catch {
    return null;
  }
}

function saveDefaults(d: PortfolioDefaults): void {
  localStorage.setItem(
    DEFAULTS_KEY,
    JSON.stringify({ filter: JSON.parse(serializeFilter(d.filter)), signals: d.signals, sort: d.sort })
  );
}

export function PortfolioContainer({ filter, onSelectCompany }: Props) {
  const [data, setData] = useState<PortfolioResponse | null>(null);
  const [isFirstLoading, setIsFirstLoading] = useState(true);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSignals, setSelectedSignals] = useState<PortfolioSignalKey[]>([]);
  const [sortKey, setSortKey] = useState<PortfolioSortKey>("urgency");
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);

  const key = filterKey(filter);

  // ----- Fetch -----
  const dataRef = useRef<PortfolioResponse | null>(null);
  useEffect(() => { dataRef.current = data; });
  const inFlightRef = useRef(false);

  const fetchData = useCallback(
    async (refresh = false) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      if (dataRef.current === null) setIsFirstLoading(true);
      else setIsRevalidating(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (refresh) params.set("refresh", "true");
        if (key !== "all") params.set("ownerIds", key);
        const url = `/api/portfolio${params.toString() ? `?${params.toString()}` : ""}`;
        const res = await apiFetch(url);
        if (!res.ok) {
          setError(friendlyErrorMessage(null, res.status));
          return;
        }
        const json: PortfolioResponse = await res.json();
        setData(json);
      } catch (err) {
        setError(friendlyErrorMessage(err));
      } finally {
        setIsFirstLoading(false);
        setIsRevalidating(false);
        inFlightRef.current = false;
      }
    },
    [key]
  );

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    function onRefresh() { fetchData(true); }
    window.addEventListener("ud-refresh-dashboard", onRefresh);
    return () => window.removeEventListener("ud-refresh-dashboard", onRefresh);
  }, [fetchData]);

  // ----- Keyboard event subscriptions -----
  const filteredSortedRows = useMemo<PortfolioRow[]>(() => {
    if (!data) return [];
    const filtered = selectedSignals.length === 0
      ? data.rows
      : data.rows.filter((r) =>
          r.signals.some((s) => {
            const key = PORTFOLIO_SIGNAL_MAP[mapKindToKey(s.kind, s.title)]?.key;
            return key && selectedSignals.includes(key);
          })
        );

    const sortOpt = getSortOptions(selectedSignals).find((o) => o.key === sortKey);
    if (!sortOpt) return filtered;
    const dir = sortOpt.direction === "desc" ? -1 : 1;
    return [...filtered].sort((a, b) => {
      const av = extractSortKey(a, sortKey);
      const bv = extractSortKey(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulls always to the bottom
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
  }, [data, selectedSignals, sortKey]);

  // Mirror sorted rows + focused index into refs so listeners read fresh state.
  const stateRef = useRef({ rows: filteredSortedRows, focused: focusedRowIndex });
  useEffect(() => {
    stateRef.current = { rows: filteredSortedRows, focused: focusedRowIndex };
  });

  useEffect(() => {
    function onNav(e: Event) {
      const direction = (e as CustomEvent<"prev" | "next">).detail;
      const { rows, focused } = stateRef.current;
      if (rows.length === 0) return;
      const next = focused == null
        ? 0
        : direction === "next"
          ? Math.min(focused + 1, rows.length - 1)
          : Math.max(focused - 1, 0);
      setFocusedRowIndex(next);
    }
    function onOpen() {
      const { rows, focused } = stateRef.current;
      if (focused == null || !rows[focused]) return;
      onSelectCompany(rows[focused].id);
    }
    function onSignalToggle(e: Event) {
      const idx = (e as CustomEvent<number>).detail;
      const key = PORTFOLIO_SIGNAL_ORDER[idx];
      if (!key) return;
      setSelectedSignals((prev) =>
        prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
      );
    }
    function onSignalClear() { setSelectedSignals([]); }
    function onSortCycle() {
      const opts = getSortOptions(selectedSignals);
      const idx = opts.findIndex((o) => o.key === sortKey);
      const next = opts[(idx + 1) % opts.length];
      if (next) setSortKey(next.key);
    }
    function onSaveDefaults() {
      saveDefaults({ filter, signals: selectedSignals, sort: sortKey });
    }

    window.addEventListener("ud-list-nav", onNav);
    window.addEventListener("ud-list-open", onOpen);
    window.addEventListener("ud-portfolio-signal-toggle", onSignalToggle);
    window.addEventListener("ud-portfolio-signal-clear", onSignalClear);
    window.addEventListener("ud-portfolio-sort-cycle", onSortCycle);
    window.addEventListener("ud-portfolio-save-defaults", onSaveDefaults);
    return () => {
      window.removeEventListener("ud-list-nav", onNav);
      window.removeEventListener("ud-list-open", onOpen);
      window.removeEventListener("ud-portfolio-signal-toggle", onSignalToggle);
      window.removeEventListener("ud-portfolio-signal-clear", onSignalClear);
      window.removeEventListener("ud-portfolio-sort-cycle", onSortCycle);
      window.removeEventListener("ud-portfolio-save-defaults", onSaveDefaults);
    };
  }, [selectedSignals, sortKey, filter, onSelectCompany]);

  // ----- Defaults: hydrate on mount -----
  const [hasSavedDefault, setHasSavedDefault] = useState(false);
  useEffect(() => {
    const d = loadDefaults();
    if (d) {
      setSelectedSignals(d.signals);
      setSortKey(d.sort);
      setHasSavedDefault(true);
    }
  }, []);

  // ----- Helpers for the View -----
  const totalsBySignal = data?.totalsBySignal ?? {
    overdue_invoices: 0, open_invoices: 0, no_future_events: 0, health_dropped: 0,
    stuck_in_step: 0, volume_declining: 0, wish_to_churn: 0, gone_quiet: 0,
  };

  // ----- Render -----
  if (error && !data) return <div style={{ padding: 24 }}>{error}</div>;
  if (isFirstLoading) return <div style={{ padding: 24 }}>Loading…</div>;
  if (!data) return null;

  return (
    <PortfolioView
      rows={filteredSortedRows}
      totalsBySignal={totalsBySignal}
      selectedSignals={selectedSignals}
      toggleSignal={(k) =>
        setSelectedSignals((prev) =>
          prev.includes(k) ? prev.filter((s) => s !== k) : [...prev, k]
        )
      }
      clearSignals={() => setSelectedSignals([])}
      sortKey={sortKey}
      setSortKey={setSortKey}
      focusedRowIndex={focusedRowIndex}
      onRowClick={(row) => onSelectCompany(row.id)}
      hasSavedDefault={hasSavedDefault}
      defaultsAreCurrent={isCurrentEqualToSaved(filter, selectedSignals, sortKey)}
      onSaveDefaults={() => {
        saveDefaults({ filter, signals: selectedSignals, sort: sortKey });
        setHasSavedDefault(true);
      }}
      onResetDefaults={() => {
        const d = loadDefaults();
        if (!d) return;
        setSelectedSignals(d.signals);
        setSortKey(d.sort);
      }}
    />
  );
}

function isCurrentEqualToSaved(
  filter: GlobalFilter,
  signals: PortfolioSignalKey[],
  sort: PortfolioSortKey
): boolean {
  const saved = loadDefaults();
  if (!saved) return false;
  if (serializeFilter(saved.filter) !== serializeFilter(filter)) return false;
  if (saved.sort !== sort) return false;
  if (saved.signals.length !== signals.length) return false;
  const a = [...saved.signals].sort();
  const b = [...signals].sort();
  return a.every((v, i) => v === b[i]);
}

function mapKindToKey(kind: string, title: string): PortfolioSignalKey {
  if (title === "Open invoice") return "open_invoices";
  switch (kind) {
    case "overdue_invoice":   return "overdue_invoices";
    case "wish_to_churn":     return "wish_to_churn";
    case "volume_declining":  return "volume_declining";
    case "no_future_events":  return "no_future_events";
    case "stuck_in_step":     return "stuck_in_step";
    case "health_dropped":    return "health_dropped";
    case "gone_quiet":        return "gone_quiet";
    default:                  return "gone_quiet";
  }
}
```

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any import issues that surface.

- [ ] **Step 3: Commit.**

```bash
git add src/components/design/views/PortfolioContainer.tsx
git commit -m "feat(portfolio): PortfolioContainer with filter + sort + keyboard subscriptions"
```

---

## Task 12: VariantPicker integration

**Files:**
- Modify: `src/components/design/VariantPicker.tsx`

- [ ] **Step 1: Add `portfolio` to `DashboardKey` and `DASHBOARDS`.**

In `src/components/design/VariantPicker.tsx:13-20`, update the union:

```ts
export type DashboardKey =
  | "status"
  | "portfolio"
  | "meeting_prep"
  | "pay_migration"
  | "bloom"
  | "search";
```

(The `onboarding` and `retention` keys are removed because Portfolio absorbs both. Code paths that referenced them are updated in later tasks.)

In the `DASHBOARDS` array (`VariantPicker.tsx:29-37`), replace with:

```ts
export const DASHBOARDS: DashboardDef[] = [
  { key: "portfolio",     label: "Portfolio",     sub: "Every account, every signal", available: true  },
  { key: "status",        label: "Status",        sub: "Needs attention today (legacy)", available: true },
  { key: "meeting_prep",  label: "Meeting prep",  sub: "Today's meetings, prep ready", available: true },
  { key: "pay_migration", label: "Pay migration", sub: "Moving accounts to Understory Pay", available: true },
  { key: "bloom",         label: "Bloom",         sub: "Marketing candidates to pitch", available: false },
  { key: "search",        label: "Lookup",        sub: "Ask anything in plain English", available: true },
];
```

- [ ] **Step 2: Typecheck. Expect failures elsewhere.**

Run: `npx tsc --noEmit`
Expected: errors in `page-client.tsx` and `ShortcutCheatSheet.tsx` referencing removed `"onboarding"` / `"retention"` literals. Those are fixed in Tasks 13 and 14.

- [ ] **Step 3: Commit (do not run tests yet, they'll fail until the wire-up is done; commit so the diffs stay reviewable).**

```bash
git add src/components/design/VariantPicker.tsx
git commit -m "feat(portfolio): register portfolio dashboard, drop onboarding/retention placeholders"
```

---

## Task 13: page-client wiring

**Files:**
- Modify: `src/app/page-client.tsx`

This is the largest single edit. The keyboard handler, URL state, dashboard switching, and prefetch wiring all live here. Work through the edits in this order to keep typecheck errors minimal between steps.

- [ ] **Step 1: Update import + DashboardKey usage.**

Find the `DashboardKey` import at `src/app/page-client.tsx:17`. No change needed (it now resolves to the updated union).

Find the dashboard validity check at `src/app/page-client.tsx:83-87`:

```ts
    d === "status" ||
    d === "meeting_prep" ||
    d === "onboarding" ||
    d === "pay_migration" ||
    d === "search"
```

Replace with:

```ts
    d === "status" ||
    d === "portfolio" ||
    d === "meeting_prep" ||
    d === "pay_migration" ||
    d === "search"
```

Find the second validity check at `src/app/page-client.tsx:266-270` and apply the same change.

- [ ] **Step 2: Add URL state for signal filter + sort.**

Find the `urlFromState` function around `page-client.tsx:108-128`. Extend the URL search-param building logic to include portfolio-specific params when the dashboard is `portfolio`. Add fields to the state shape near the top (search for `interface DashboardState` or similar; it likely ships as a type alias):

```ts
// Existing state shape additions:
//   portfolioSignals: PortfolioSignalKey[];
//   portfolioSort: PortfolioSortKey;
```

In `urlFromState`:

```ts
  if (state.dashboard === "portfolio") {
    if (state.portfolioSignals && state.portfolioSignals.length > 0) {
      sp.set("s", state.portfolioSignals.join(","));
    }
    if (state.portfolioSort && state.portfolioSort !== "urgency") {
      sp.set("sort", state.portfolioSort);
    }
  }
```

In the URL parser (the function that reads `?d=` and friends), add:

```ts
  if (out.dashboard === "portfolio") {
    const s = sp.get("s");
    if (s) out.portfolioSignals = s.split(",") as PortfolioSignalKey[];
    const sort = sp.get("sort");
    if (sort) out.portfolioSort = sort as PortfolioSortKey;
  }
```

- [ ] **Step 3: Add new state hooks for portfolio.**

Near where other dashboard-specific state is declared (search for `useState<DashboardKey>`), add:

```ts
  const [portfolioSignals, setPortfolioSignals] = useState<PortfolioSignalKey[]>([]);
  const [portfolioSort, setPortfolioSort] = useState<PortfolioSortKey>("urgency");
```

Add the corresponding URL-write effect: include `portfolioSignals` and `portfolioSort` in the deps of the existing `urlFromState` write `useEffect` (search for `localStorage.setItem("ud-v2-dashboard"`).

- [ ] **Step 4: Add the new keyboard shortcuts.**

Find the keydown handler (`page-client.tsx:720+`). Add new branches that fire only when `state.dashboard === "portfolio"`. Place them near the existing `R` refresh / `?` cheat sheet branches. The capture-phase listener already calls `e.stopPropagation()` once it acts on a key; follow the same pattern.

```ts
      // Portfolio-only shortcuts
      if (state.dashboard === "portfolio") {
        // 1-8 toggles signal filter
        if (e.key >= "1" && e.key <= "8" && !e.metaKey && !e.ctrlKey) {
          const idx = Number(e.key) - 1;
          window.dispatchEvent(new CustomEvent("ud-portfolio-signal-toggle", { detail: idx }));
          e.preventDefault();
          return;
        }
        if (e.key === "0" && !e.metaKey && !e.ctrlKey) {
          window.dispatchEvent(new Event("ud-portfolio-signal-clear"));
          e.preventDefault();
          return;
        }
        if ((e.key === "s" || e.key === "S") && !e.metaKey && !e.ctrlKey) {
          window.dispatchEvent(new Event("ud-portfolio-sort-cycle"));
          e.preventDefault();
          return;
        }
        if ((e.key === "s" || e.key === "S") && (e.metaKey || e.ctrlKey)) {
          window.dispatchEvent(new Event("ud-portfolio-save-defaults"));
          e.preventDefault();
          return;
        }
      }
```

- [ ] **Step 5: Render the PortfolioContainer.**

Find the dashboard render switch around `page-client.tsx:941-995`. Add a branch:

```tsx
    if (dashboard === "portfolio") {
      mainContent = (
        <PortfolioContainer
          filter={globalFilter}
          filterLabel={filterLabel(globalFilter)}
          onSelectCompany={(id) => setSelectedCompanyId(id)}
        />
      );
    }
```

(Add `import { PortfolioContainer } from "@/components/design/views/PortfolioContainer";` to the imports at the top.)

- [ ] **Step 6: Hook up prefetch.**

Find where `prefetchOnboarding` etc. are called on hover (likely in a function passed to the dashboard picker). Add a `prefetchPortfolio` call where `prefetchAttention` is called or alongside the others:

```ts
    if (target === "portfolio") prefetchPortfolio(currentOwnerIdsCsv);
```

(Add `prefetchPortfolio` to the import block from `@/lib/prefetch`.)

- [ ] **Step 7: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors. Address any literal-type narrowing issues.

- [ ] **Step 8: Commit.**

```bash
git add src/app/page-client.tsx
git commit -m "feat(portfolio): wire portfolio into page-client (state + keyboard + render)"
```

---

## Task 14: ShortcutCheatSheet update

**Files:**
- Modify: `src/components/ShortcutCheatSheet.tsx`

- [ ] **Step 1: Update the `dashboard` prop type.**

`ShortcutCheatSheet.tsx:8-15` lists dashboards explicitly. Replace with:

```ts
  dashboard:
    | "status"
    | "portfolio"
    | "meeting_prep"
    | "pay_migration"
    | "bloom"
    | "search";
```

- [ ] **Step 2: Add a Portfolio block in the `groups` function.**

Inside the `groups()` function (`ShortcutCheatSheet.tsx:34+`), after the Status block (or the dashboard-switch block), add:

```ts
  if (ctx.dashboard === "portfolio") {
    out.push({
      heading: "Portfolio",
      rows: [
        { label: "Toggle signal filter", keys: "1-8" },
        { label: "Clear all signal filters", keys: "0" },
        { label: "Cycle sort", keys: "S" },
        { label: "Save current as default", keys: `${modLabel} + S` },
        { label: "Navigate rows", keys: "Up / Down" },
        { label: "Open account", keys: "Enter" },
      ],
    });
  }
```

Update the "Switch dashboard" group to add a Portfolio entry and remove the Onboarding entry (since the placeholder is gone):

```ts
  out.push({
    heading: "Switch dashboard",
    rows: [
      { label: "Portfolio", keys: "G then F" },
      { label: "Status", keys: "G then S" },
      { label: "Meeting prep", keys: "G then M" },
      { label: "Lookup", keys: "G then L" },
      { label: "Pay migration", keys: "G then P" },
      { label: "Bloom", keys: "G then B" },
    ],
  });
```

(If `G then F` collides with another mapping in the dashboard switcher logic, pick another letter such as `G then T` for poRTfolio. Verify in `page-client.tsx`'s dashboard-letter handler.)

- [ ] **Step 3: Typecheck and commit.**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/ShortcutCheatSheet.tsx
git commit -m "feat(portfolio): cheat sheet entries for Portfolio shortcuts"
```

---

## Task 15: Verification

**Files:** none

- [ ] **Step 1: Run the full test suite.**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 2: Run lint.**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Run the production build (this also serves as the typecheck).**

Run: `npm run build`
Expected: "Compiled successfully" with no type errors.

- [ ] **Step 4: Manual smoke test on localhost.**

Run: `npm run dev`
Open http://localhost:3000 and verify:

1. Status dashboard still loads (default landing).
2. Switch to Portfolio via the dashboard picker. Rows render with stage badges and signal pills.
3. Toggle signal pill: rows narrow to those with that signal. Pill counts persist.
4. Toggle a second signal: rows update to OR semantics. Sort menu shows universal sorts only.
5. Clear filter, select exactly one signal: sort menu shows signal-specific options.
6. Sort by health (worst first): rows reorder. Sort by revenue: rows reorder.
7. Press `1` to toggle the first signal. Press `0` to clear. Press `S` to cycle sort.
8. Save defaults via `Cmd+S` (Mac). Refresh the page: defaults restore.
9. Press `?`: cheat sheet shows the Portfolio block.
10. Click a row: company detail panel opens.
11. Switch back to Status: it works as before.
12. URL reflects state: `?d=portfolio&s=overdue_invoices&sort=oldest_outstanding`. Browser back/forward round-trips.

If anything is broken, fix and commit fixes before moving on.

- [ ] **Step 5: Final commit (optional, only if verification fixes were needed).**

Otherwise no commit needed, verification is read-only.

---

## Out of scope (deferred from spec)

- Portfolio Split + Kanban variants (architecture leaves room; build later)
- Multi-sort, CSV export, saved named views
- Bloom dashboard
- Auto-flip of default landing dashboard from `status` to `portfolio` (manual cutover by the team after V1 stabilizes)
