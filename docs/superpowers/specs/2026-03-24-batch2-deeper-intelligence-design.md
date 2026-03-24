# Batch 2: Deeper Intelligence

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Health score visualization, timeline context on attention signals, snooze/dismiss signals

---

## 1. Health Score Visualization

**Goal:** Show the customer's health score with trend in the company header so you immediately know their status.

### Badge Design
- Colored pill badge displayed inline with the company name in `CompanyHeader`.
- Four categories with distinct colors:
  - **Healthy:** green background (#D1FAE5), dark green text (#065F46)
  - **Monitor:** amber background (#FEF3C7), amber text (#92400E)
  - **At Risk:** orange background (#FED7AA), orange text (#9A3412)
  - **Critical Churn Risk:** red background (#FEE2E2), red text (#991B1B)

### Trend Arrow
- If `previousCategory` exists on the company data and differs from current category:
  - **Improving** (moved toward Healthy): show up arrow and "was [previous]" in muted text
  - **Declining** (moved toward Critical): show down arrow and "was [previous]" in muted text
- Category order for comparison: Healthy > Monitor > At Risk > Critical Churn Risk
- If no previous category or same as current: show badge only, no arrow.

### Data Source
- Current category: `company["Health Score Category"]` from the HubSpot company object (already fetched).
- Previous category and change date: These exist on `AttentionCompany` but NOT on the company detail object. Two options:
  - **Option A:** Add `health_score_previous_category` and `health_score_category_changed_at` to the HubSpot company fetch. This requires these properties to exist in HubSpot.
  - **Option B:** Only show the trend arrow when the data is available (attention companies have it, direct search results may not).
- **Decision:** Go with Option B. Show trend when data is available. The badge always shows current category. The trend arrow is a bonus when we have the history.
- To make trend available in company detail view: store attention metadata in a ref when navigating from the attention list.
- **Mechanism:** Add `attentionMetaRef` as `useRef<{ previousCategory?: string; categoryChangedAt?: string } | null>(null)` in `page.tsx`. In `handleAttentionSelect`, before fetching, look up the selected company in the attention data to extract `previousCategory` and `categoryChangedAt`, and store in the ref. Pass these as optional props to `CompanyHeader`. Clear the ref in `handleBack`. When navigating via search, the ref stays null and no trend is shown.

### UI Placement
- Badge sits after the company name, same line, with a small gap.
- If company has no health score category value, badge is not rendered.

---

## 2. Timeline Context on Signals

**Goal:** Show how long each company has been in an attention group so you can spot festering issues.

### Data
- Add `enteredGroupAt` field to `AttentionCompany` type (optional ISO timestamp string).
- Computed server-side in the attention API route when building attention data:
  - For overdue tasks: approximate from `daysOverdue` (current date minus daysOverdue).
  - For overdue invoices: `daysOverdue` may not be available on all entries. If available, use it. If not, omit `enteredGroupAt` for that entry.
  - For health score changes: use `categoryChangedAt` as the entry timestamp.
  - For gone quiet: approximate from `daysSilent` (current date minus daysSilent).
- If the server cannot compute a reliable timestamp, omit the field.

### Display
- Shown on each company row in the attention list, after the existing detail/urgency info.
- Separated by a left border (subtle divider).
- Format:
  - Less than 24 hours: "new today"
  - 1 day: "in group 1d"
  - N days: "in group Nd"
  - 30+ days: "in group Nmo" (use `Math.floor(days / 30)`, so 30-59 days = "1mo", 60-89 = "2mo", etc.)
- Styled as muted text (11px, light gray) so it doesn't compete with urgency indicators.

### No Persistence
- This is a computed/derived value, not stored. Recalculated on each attention data fetch.

---

## 3. Snooze / Dismiss Signals

**Goal:** Temporarily hide companies from the attention list when you're aware of the issue and don't need the reminder.

### Trigger
- Small bell/snooze icon appears on the right side of each company row (`CompanyRow` component inside `AttentionGroup`). The icon is visible on hover, always visible on mobile.
- Clicking the icon opens a popover anchored to the button. The snooze icon receives the current group's `signal` via props so it knows which signal to snooze.
- **Snooze is signal-specific, not company-wide.** A company can appear in multiple groups (e.g. overdue invoice AND gone quiet). Snoozing in one group does not affect the other. This is intentional - different signals represent different issues that may resolve independently.

### Snooze Popover
- Title: "Snooze this company"
- Three preset buttons stacked vertically:
  - "1 week"
  - "2 weeks"
  - "1 month"
- Divider line.
- Custom date row: "Until:" label + native date input.
- Clicking any preset or selecting a custom date immediately snoozes and closes the popover.
- Click outside closes the popover without snoozing.

### Storage
- localStorage key: `"snoozed-companies"`
- Data structure: JSON array of objects:
  ```typescript
  interface SnoozedCompany {
    companyId: string;
    signal: AttentionSignal;
    snoozeUntil: string; // ISO date string
    companyName: string; // for display in snoozed list
  }
  ```
- When snoozing: add entry (or update if already snoozed for same signal).
- On render: filter out companies whose `companyId + signal` combo has a snooze entry with `snoozeUntil` in the future.
- Auto-cleanup: remove expired entries on each read.

### Snoozed Companies UI
- Snoozed companies are hidden from the main attention list by default.
- At the bottom of each attention group that has snoozed items, show a toggle: "Show snoozed (N)".
- When expanded, snoozed items appear dimmed (reduced opacity) with:
  - "Snoozed until [date]" replacing the normal detail text.
  - An "Unsnooze" button that removes the snooze entry immediately.
- The group count badge in the header does NOT include snoozed companies (shows active count only).
- The summary grid cards at the top of `AttentionList` also exclude snoozed companies from their counts.
- When "My accounts" filter is active, only the current user's snoozed items show in the "Show snoozed" toggle (snoozed items from other owners are hidden entirely).
- Snooze/unsnooze actions should use `transition-all duration-200` to match existing UI transitions.

### Snooze Utility Functions
- `getSnoozedCompanies(): SnoozedCompany[]` - read and auto-clean expired entries
- `snoozeCompany(entry: SnoozedCompany): void` - add or update snooze
- `unsnoozeCompany(companyId: string, signal: AttentionSignal): void` - remove snooze
- `isCompanySnoozed(companyId: string, signal: AttentionSignal): boolean` - check status

---

## Technical Notes

### No New Dependencies
All features use existing stack. Snooze uses localStorage (same pattern as recent companies).

### Type Changes
- `AttentionCompany`: add optional `enteredGroupAt?: string`
- No other type changes needed.

### Components to Create or Modify
- **New:** `HealthBadge` (health score pill with trend), `SnoozePopover` (snooze preset/custom date picker), `src/lib/snooze.ts` (localStorage CRUD)
- **Modify:** `CompanyHeader` (add HealthBadge), `AttentionGroup` (add timeline display, snooze icon, snoozed items toggle), `AttentionList` (exclude snoozed from summary counts), `src/lib/types.ts` (add enteredGroupAt), `src/app/page.tsx` (attentionMetaRef for trend data), attention API route (compute enteredGroupAt)

### Testing
- Unit tests for snooze localStorage logic (add, remove, check, auto-clean expired)
- Unit tests for health score trend calculation (improving/declining/no change)
- Unit tests for timeline duration formatting (new today, days, months)
