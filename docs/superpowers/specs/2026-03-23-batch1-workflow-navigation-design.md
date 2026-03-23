# Batch 1: Workflow & Navigation Improvements

**Date:** 2026-03-23
**Status:** Approved
**Scope:** Sort attention signals, recent companies, back navigation, keyboard shortcuts, activity filters

---

## 1. Sort Within Attention Groups

**Goal:** Surface highest-priority companies first within each attention group.

### Behavior
- Each attention group (Overdue Invoices, Overdue Tasks, Health Score Issues, Gone Quiet) gets a sort toggle in its header.
- **Default sort:** MRR descending (highest-value customers first).
- **Secondary sort per group type:**
  - Overdue Invoices / Overdue Tasks: "Days overdue" (sorts by `daysOverdue` descending).
  - Gone Quiet: "Days silent" (sorts by `daysSilent` descending).
  - Health Score Issues: No secondary sort - only MRR sort is available. No toggle rendered for this group.
- Sort preference is per-group and resets on page load (not persisted).
- The sort toggle renders as two small buttons ("MRR" | "Days overdue"/"Days silent") next to the group title. Active sort has filled background (#022C12), inactive has outline style.
- **Tiebreaker:** When two companies share the same sort value, secondary sort is alphabetical by company name.

### Data Requirements
- MRR is already available in `AttentionCompany` as `mrr`.
- Days overdue is available as `daysOverdue`.
- Days silent is available as `daysSilent`.
- Sorting is client-side only, no API changes needed.

### UI Placement
- Sort toggle sits right-aligned in the attention group header row, same line as the group label and count badge.
- Label: "Sort:" prefix in muted text, then the two toggle buttons.

---

## 2. Recent Companies in Search

**Goal:** Eliminate repetitive searching for the same customers.

### Behavior
- When the search bar receives focus with an empty or cleared query, a dropdown appears showing the last 5 viewed companies under a "Recent" header.
- **Search field clearing:** Pressing Cmd+K always clears the search field before focusing. Navigating back from a company detail view also clears the field. This ensures recent companies appear on focus.
- Each entry shows a clock icon and the company name.
- Clicking a recent company navigates to it (same as selecting a search result).
- As the user types, recent companies that match the query appear above a divider, with API search results below.
- If no recent companies match the typed query, the "Recent" section is hidden.

### Storage
- Recent companies stored in `localStorage` as an array of `{ id, name }` objects.
- Max 5 entries. New views push to front, duplicates are moved to front (not added again).
- Updated whenever a company detail view loads successfully.
- **Stale entry handling:** If clicking a recent company returns an API error (e.g., company deleted from HubSpot), silently remove it from the recents list.

### UI Details
- Dropdown reuses the existing search results dropdown styling.
- "Recent" label: 11px uppercase, muted color (#888), with left padding matching result items.
- Clock icon (unicode or SVG) before each company name.
- Cmd+K hint badge shown inside search bar, right-aligned. Hidden when input is focused or has text.

---

## 3. Back Navigation

**Goal:** Return to the attention list without losing context.

### Behavior
- A back arrow button appears in the company header when the user navigated from the attention list.
- Clicking it returns to the attention list and restores the previous scroll position.
- Esc key also triggers back navigation when not in an input field.
- Browser back button works naturally (uses router history).
- The back arrow is NOT shown when the user arrived via direct search (no meaningful "back" destination in the attention list).
- **Replaces existing "Back to overview" button** in `page.tsx` with this new conditional back arrow in the company header. Single back mechanism, not two competing buttons.

### Tracking Navigation Source
- Add a `navigationSource` state to the main page: `"attention" | "search" | null`.
- When `AttentionList` triggers company selection, set source to `"attention"`.
- When `SearchBar` triggers company selection, set source to `"search"`.
- Back arrow visibility is controlled by `navigationSource === "attention"`.
- Clearing the selected company resets `navigationSource` to `null`.

### Scroll Restoration
- Before navigating to a company, save the current scroll position of the attention list to a ref or sessionStorage.
- On return, restore that scroll position after the attention list renders.

### UI Details
- Back arrow: 32x32px button, 8px border-radius, 1px border, left of company name.
- Arrow character or SVG icon, #022C12 color.
- Hover: light background (#F8F6ED).

---

## 4. Keyboard Shortcuts

**Goal:** Power-user navigation speed across the entire dashboard.

### Shortcut Map

| Shortcut | Action | Context |
|----------|--------|---------|
| Cmd+K | Focus search bar | Global |
| Esc | Go back / close modal / blur search | Global |
| Arrow Up/Down | Navigate attention list items | When attention list is focused |
| Enter | Open selected company | When a list item is highlighted |
| 1-4 | Jump to attention group by index | When attention list is visible (maps to visible groups only; no-op if index exceeds visible count) |
| ? | Toggle shortcut cheat sheet | Global (not in input fields) |

### Focus Management
- Arrow key navigation adds a visible highlight (outline or background) to the currently focused attention list item.
- Enter opens the highlighted item.
- Number keys (1-4) scroll to and focus the first item in that attention group.
- All shortcuts are suppressed when an input field is focused (except Esc and Cmd+K).
- **Yielding to component handlers:** The global keyboard listener must check `document.activeElement`. When SearchBar is focused, its own Arrow Up/Down and Enter handlers take priority. The global listener must not interfere with component-level keyboard handling.

### Cheat Sheet Overlay
- Triggered by `?` key.
- Centered modal with semi-transparent backdrop.
- Lists all shortcuts in a two-column layout (description left, key combo right).
- Dismissed by Esc, clicking outside, or pressing `?` again.
- Simple, no animation needed in this batch (animations come in Batch 3).

### Platform Awareness
- Detect Mac vs Windows/Linux.
- Show Cmd on Mac, Ctrl on Windows/Linux.
- Use `event.metaKey` on Mac, `event.ctrlKey` on Windows.

---

## 5. Activity Filters

**Goal:** Quickly find specific activity types and narrow the time window.

### Type Filter (multi-select toggle pills)
- A row of pill buttons above the activity list: All, Calls, Meetings, Notes, Emails.
- "All" is active by default (all types shown).
- Clicking a specific type when "All" is active deactivates "All" and activates only that type. Subsequent clicks toggle individual types on/off.
- Clicking "All" resets to all types active.
- If all four individual types are toggled on manually, "All" becomes active automatically (and the individual highlights clear).
- If the last active type is toggled off, "All" reactivates.
- Active pill: filled (#022C12 background, white text). Inactive: outline style.

### Date Range Filter (single-select presets)
- Preset buttons right-aligned: 7d, 30d, 60d, 90d.
- Single-select (one active at a time). Default: 90d.
- Filters apply client-side to already-fetched engagement data (the API always fetches 90 days).
- **Timestamp parsing:** Engagement timestamps may be Unix timestamp strings or ISO date strings. The filter logic must handle both formats (use the existing `formatTimestamp` parsing approach).
- Active preset: filled style. Inactive: outline style.

### Filtered State
- Activity list updates immediately on filter change.
- Show count of visible activities (e.g., "Showing 12 activities" or "3 calls in last 30 days").
- If no activities match filters, show a friendly empty state: "No [type] in the last [range]".

### UI Layout
- Filter row sits between the tab bar and the activity list.
- Type pills left-aligned, date range pills right-aligned.
- Responsive: on narrow screens, type pills wrap to a second line, date range stays right-aligned below.

---

## Technical Notes

### No New Dependencies
All features are implementable with existing stack. No new packages needed.

### State Management
- Sort preference: component state (useState per group).
- Recent companies: localStorage + component state.
- Scroll position: ref or sessionStorage.
- Keyboard shortcuts: single global event listener, registered in a top-level component or hook.
- Activity filters: component state in ActivityTab.

### Components to Create or Modify
- **New:** `SortToggle` (reusable for attention groups), `KeyboardShortcuts` (global listener + cheat sheet), `ActivityFilters` (type pills + date range).
- **Modify:** `AttentionGroup` (add sort toggle + sort logic), `SearchBar` (add recent companies dropdown), `CompanyHeader` (add back arrow), `ActivityTab` (add filter row + filter logic), `page.tsx` (scroll position save/restore).

### Testing
- Unit tests for sort logic (MRR vs days overdue ordering).
- Unit tests for recent companies localStorage logic (add, dedupe, max 5).
- Unit tests for activity filter logic (type filtering, date range filtering).
- Keyboard shortcut tests can be added in a later pass.
