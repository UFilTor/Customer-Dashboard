# Retention Dashboard — Meeting Prep (v1)

**Date:** 2026-05-02
**Status:** Drafted, pending review
**Scope:** First feature of the Retention dashboard. Mirrors the Onboarding meeting prep scaffold but tunes the brief content for live customers.

---

## 1. Overview

The Retention dashboard helps the CS team prep for meetings with **existing, live customers**. The first cut is meeting prep: the same day-strip + meeting-list scaffold the Onboarding dashboard uses, but the per-meeting brief swaps onboarding-specific blocks (OB Notes, "Step:") for retention-specific blocks (Booking Volume chart, Health rings, Future events, Open/Overdue invoices).

The retention slot already exists in `DashboardPicker` as `available: false`. This spec turns it on.

### Why retention is its own dashboard

The Status dashboard surfaces accounts that need attention *today*. The Onboarding dashboard prepares meetings for accounts still being set up. The Retention dashboard fills the gap: meeting prep for accounts that are *up and running* — recurring check-ins, QBRs, expansion talks, renewals.

The data already separates these populations: deals on the **Customer retention pipeline** (`1072518362`) with `customer_stage ∈ {Adopted, Started, Ramp Up, Established}` are graduated, live customers. That's the retention pool.

---

## 2. Scope of v1

**In scope:**
- New "Meeting prep" view for retention-pipeline deals
- New brief panel content (Booking Volume + Health + Customer + Commercial / Previous activity + Watch out for)
- Wired into `DashboardPicker` (flip `available: true`)
- Reuses Onboarding's day strip, meeting list, keyboard nav, lazy-fetch pattern, caching pattern
- Auto-populated "Watch out for" with retention churn signals

**Deferred (placeholder, no implementation):**
- "Needs attention" subview tab — leave the `VariantPicker` slot ready so we can add it without restructuring later

**Out of scope:**
- Renewal date / contract end tracking (no HubSpot property identified yet)
- Expansion / upsell pipeline integration
- Cross-pipeline customer journey timeline

---

## 3. Data scope

### Retention pool

A retention deal is any deal where:
- `pipeline === "1072518362"` (Customer retention)
- `customer_stage ∈ {"Adopted", "Started", "Ramp Up", "Established"}` (excludes Churned and any inactive stages)

`fetchSalesDealsForCompanies` and the lifecycle-deal lookup chain remain identical to onboarding for sales-owner resolution and commercial-property fallback.

### Meeting filter

All HubSpot meetings logged on retention-pipeline deals show up — no `hs_activity_type` filter. The global owner filter (All / Region / Person) scopes results, identical to Onboarding.

### Day window

Same as Onboarding: today + the next 4 work days by default, with manual fetch for any other day via the day-strip control.

### New properties to fetch

All on the company record, all already pulled by `COMPANY_PROPERTIES_TO_FETCH` (no new fetches needed):

- `understory_health_score_upcoming_events` → "Future events" line
- `understory_booking_volume_1m / _2m / _3m / _6m / _12m / _all_time` → Booking Volume card
- `understory_health_score_*` (all 7 sub-scores) → Health Breakdown rings
- `health_score` → top-line score

On the deal, additionally fetched:
- `customer_live_date` → "Live X days" tenure pill in header
- `unpaid_invoice`, `number_of_open_invoices`, `invoice_due_date`, `outstanding_amount` → Open/Overdue invoice rows in Commercial

---

## 4. UI layout

### Brief panel structure

Mirrors the Onboarding brief scaffold with two changes: the header drops "Step:" and adds tenure; the left column swaps OB Notes for two visualization cards.

**Header band (full width)** — same as Onboarding:
- Date / time / scheduled badge (left)
- Company name + meta line: `Owner · Region · Customer stage · Live X days` (center)
- View account (citrus) + Open in HubSpot buttons (right)
- Italic subtitle: `{Account} & Understory`

**Left column — data:**

1. **Booking Volume** — reuses existing `<VolumeChart>` from `src/components/design/VolumeChart.tsx` as-is. Shows the area chart, 3M/6M/12M/All toggle, and the 1M/3M/6M/12M strip below.

2. **Health Breakdown** — reuses existing `<HealthRings>` from `src/components/design/HealthRings.tsx` as-is. Shows the score, "Strong/Healthy/At Risk/Critical" pill, and 7 sub-score rings.

3. **Customer** — same content as Onboarding: Contact (name/email/phone), Website, Storefront.

4. **Commercial** — same Onboarding fields (Sales owner, ACV, Booking fee, Monthly fee, First billing) **plus**:
   - Open invoices: `{count}`
   - Overdue: `{count} · {days} days · {outstanding} EUR` (red number when > 0)
   - Future events: `{count} scheduled`

**Right column — activity:**

1. **Previous activity** — same component as Onboarding's timeline: Email in / Email out / Meeting / Call entries with date, title, and Gong-summary excerpt where available.

2. **Watch out for** — auto-populated. See section 6 for the signal logic.

### Outer layout

Identical to Onboarding's meeting prep:
- Sticky day strip across the top (5 weekdays visible, today centered, manual fetch buttons on out-of-window days)
- Meeting list on the left of the brief panel
- Brief panel renders for the selected meeting/deal
- Keyboard nav: `j/k` or arrows for meeting nav, `Enter` to expand, day-shift shortcuts for the strip, `R` to refresh

---

## 5. Architecture

### New files

```
src/lib/retention.ts              — buildRetentionPayload, mirrors onboarding.ts patterns
src/app/api/retention/route.ts    — GET handler with per-filter cache, edge SWR
src/app/api/retention/day/route.ts — single-day fetch outside default window
src/app/api/retention/history/route.ts — lazy email/call backfill
src/components/design/views/RetentionContainer.tsx — fetch + state
src/components/design/views/RetentionView.tsx — presentation (meeting list + brief)
src/components/design/views/RetentionBrief.tsx — the brief panel itself (extracted for clarity, see note)
```

A note on `RetentionBrief.tsx`: Onboarding's brief is currently inline in `OnboardingView.tsx`. For Retention, extract the brief into its own component from day one — it has more sections (4 left + 2 right) and embedding `<VolumeChart>` + `<HealthRings>` makes the file unwieldy if inline.

### Reuse strategy

**Reuse as-is:**
- `<VolumeChart>` — already written, takes a company-property bag
- `<HealthRings>` — already written, takes a company-property bag
- Day-strip rendering logic (worth extracting from `OnboardingView` into a shared `DayStrip` component, see section 9)
- Cache pattern (`Cache<T>` with 15-min TTL, `getOrBuild` for in-flight dedupe, `Cache-Control: s-maxage=840, stale-while-revalidate=60`)
- `effectiveOwnerIds(filter)` for owner scoping
- `apiFetch` + `friendlyErrorMessage` for the container
- `hubspotCompanyUrl` / `hubspotDealUrl` for deep-links
- `useListKeyboardNav` for meeting-list keyboard nav

**Clone with modifications:**
- `OnboardingContainer` → `RetentionContainer` (different endpoint, same fetch structure)
- The meeting-prep panel structure (day strip + meeting list scaffold)

**Do not generalize yet:** `onboarding.ts` is 1000+ lines. Don't refactor it to share with `retention.ts` in this pass — clone what's needed (day-window math, owner-meetings fetch, brief enrichment) and leave the dedup as a follow-up if a third dashboard ever wants it.

### Type shapes

New types in `src/lib/types.ts`:

```ts
export interface RetentionDeal {
  dealId: string;
  dealName: string;
  companyId: string;
  companyName: string;
  customerStage: string;          // Adopted / Started / Ramp Up / Established
  liveDate: string | null;        // customer_live_date ISO
  daysLive: number | null;        // computed
  ownerId: string | null;
  ownerName: string | null;
  // Customer block
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  website: string | null;
  storefrontUrl: string | null;
  // Commercial block
  commercial: OnboardingCommercial;  // reuse — same shape
  invoices: {
    open: number;
    overdue: number;
    overdueDays: number | null;
    outstandingEur: number | null;
  };
  futureEvents: number | null;
  // Volume + health (raw company props passed through to VolumeChart / HealthRings)
  companyProps: Record<string, string>;
  // Risk
  watchOutFor: WatchOutSignal[];
}

export type WatchOutSignalSeverity = "warn" | "bad";

export interface WatchOutSignal {
  kind: "overdue_invoice" | "gone_quiet" | "no_future_events" | "wish_to_churn" | "volume_declining" | "health_dropped";
  severity: WatchOutSignalSeverity;
  title: string;
  detail: string;
}

export interface RetentionResponse {
  deals: RetentionDeal[];
  meetings: OnboardingMeetingEntry[];   // reuse — same shape
  updatedAt: string;
}
```

---

## 6. "Watch out for" signal logic

Centralized in `src/lib/retention.ts` (or a shared `signals.ts` helper since onboarding will reuse — see section 9). Returns an array of `WatchOutSignal` per deal. Order = severity-first, then chronology.

| Kind | Severity | Trigger | Title / detail |
|---|---|---|---|
| `overdue_invoice` | bad | `unpaid_invoice = true` AND `invoice_due_date` in past | "Overdue invoice" / "{count} invoice overdue {days} days · {outstanding} EUR outstanding" |
| `wish_to_churn` | bad | `wish_to_churn = true` AND not yet churned | "Wish-to-churn flagged" / `{churn_reason}` if set |
| `volume_declining` | bad | `volume_3m < 0.5 * (volume_6m - volume_3m)` (last 3m run-rate < 50% of prior 3m) | "Volume declining" / "Last 3m {x} EUR vs prior 3m {y} EUR" |
| `health_dropped` | warn | Current `health_score < 60` | "Health score {score}" / "{label} — review sub-scores" |
| `no_future_events` | warn | `understory_health_score_upcoming_events = 0` or null | "No upcoming events" / "Storefront has nothing scheduled" |
| `gone_quiet` | warn | `notes_last_contacted` 30+ days old (45+ days = bad) | "Last contact {n} days ago" / "No outbound since {date}" |

When the array is empty, the section renders `Nothing flagged.` (italic, muted), matching the onboarding empty state.

---

## 7. API route + caching

`/api/retention` behaves identically to `/api/onboarding`:
- Cache key: `retention:${ownerIds || "all"}`
- 15-min in-memory TTL via `Cache<RetentionResponse>`
- `getOrBuild` for in-flight dedupe
- `Cache-Control: public, s-maxage=840, stale-while-revalidate=60` for edge CDN
- `?refresh=true` busts the cache (used by manual refresh and the `R` shortcut)
- `?ownerIds=...` scopes to specific owners

`/api/retention/day` and `/api/retention/history` mirror their `/api/onboarding/...` counterparts for single-day fetch and lazy email/call backfill respectively.

### Cron warming

Add `/api/retention` to the existing `/api/cron/warm` route alongside `/api/onboarding`, `/api/attention`, and `/api/pay-migration`. Same `*/14 * * * *` schedule. Same `CRON_SECRET` gate.

---

## 8. Wiring into the dashboard shell

### `DashboardPicker` (`src/components/design/VariantPicker.tsx`)

Flip the existing entry:
```ts
{ key: "retention", label: "Retention", sub: "Live customers · meeting prep", available: true }
```
Update `sub` from "Churn risk + renewals" to "Live customers · meeting prep" — more honest about v1 scope.

Add `prefetchRetention` to `src/lib/prefetch.ts` and wire it into the hover-prefetch handler.

### `page.tsx`

- Add `"retention"` handling in the dashboard switch — render `<RetentionContainer />`.
- The retention dashboard reuses the global filter (left pill = kind, right pill = value), no special case.
- Add `selectionByScope.retention` slot for per-dashboard selection memory (currently the design groups non-Status dashboards into `_other`; promote retention to its own slot so switching between Onboarding and Retention preserves each one's selection).
- Add a `g r` keyboard shortcut to jump to Retention (mirrors `g l` for Lookup, `g o` for Onboarding).

### `VariantPicker` subview tabs

For v1, retention has no subview tabs — leave the slot empty. Wire the conditional so when we add "Needs attention" later, it'll surface tabs the same way Onboarding does:

```ts
const showRetentionTabs = dashboard === "retention" && /* future flag */;
```

---

## 9. Improvements to existing surfaces

Three small additions to **Onboarding meeting prep** that share infrastructure with retention. These are part of this spec because they fall out naturally from the retention work:

1. **Open / Overdue invoice rows in Commercial** — currently absent from the onboarding brief. Same source data (`unpaid_invoice`, `invoice_due_date`, `outstanding_amount`). Add the two rows to the Commercial section in the onboarding brief.

2. **Future events row in Commercial** — currently absent. Same source (`understory_health_score_upcoming_events`). Useful signal for "are they ready to launch?" Add as a row in Commercial.

3. **Auto-populated "Watch out for"** — currently almost always empty. The same signal logic from section 6 applies (with one onboarding-specific addition: `stuck_in_step` for accounts past their expected step duration, which already exists as the attention-tab logic).

These changes also justify extracting two small shared modules:
- `src/lib/signals.ts` already exists; extend it with the `WatchOutSignal` framework so both Onboarding and Retention build on the same primitives.
- `src/components/design/DayStrip.tsx` — extract the day-strip rendering (currently inline in `OnboardingView`) so Retention's view doesn't duplicate it.

The `<VolumeChart>` and `<HealthRings>` components are intentionally NOT added to the onboarding brief — new customers don't have enough history for either to be informative.

---

## 10. Testing

- Unit: signal classifier in `src/lib/signals.ts` — six rules, six tests.
- Unit: retention pool filter (pipeline + stage gating) in `src/lib/retention.ts`.
- Unit: invoice formatting (overdue days math, EUR conversion).
- Manual: load `/` with retention selected, confirm meetings render, brief shows real data for a known retention account, day-strip works, refresh works, owner filter scopes results.
- Manual: confirm onboarding brief gains the three new rows + populated Watch out for without breaking existing behavior.

---

## 11. Open questions for review

- Should the `Established`-stage tenure pill say "Live X days" or graduate to "Live X months / years" past 90 days? (Lean: months past 60 days, years past 365.)
- "Volume declining" signal threshold — is 50% of prior 3m the right cutoff, or should it be tighter (e.g., 30%)?
- For `gone_quiet`, where's the line between warn and bad? (Drafted: 30 days warn, 45 bad.)

These are worth resolving before implementation, but none block design approval.
