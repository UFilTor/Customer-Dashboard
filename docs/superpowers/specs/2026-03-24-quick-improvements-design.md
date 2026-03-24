# Quick Improvements: Search Enrichment, Hover Preview, Activity Search, Portfolio Stats

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Four independent UI improvements

---

## 1. Search Result Enrichment

**Goal:** Show revenue and health score in search results so you can triage without clicking.

### Search API Changes
- Modify `/api/companies/search` to return additional fields: `revenue` (EUR string) and `healthScore` (category string).
- The search API currently calls HubSpot company search and returns `{ id, name, domain }`.
- Enrich: after getting company results, fetch their lifecycle deals (batch) to compute generated revenue. Also include `Health Score Category` in the company search properties.
- Return type becomes: `{ id, name, domain, revenue?: string, healthScore?: string }`.

### UI Changes
- In SearchBar dropdown, show a second line below company name: `€25 000 · Healthy` (muted text, same style as domain).
- If revenue or health score is missing, show whichever is available.
- Apply to both API results and recent companies.

### Recent Companies Storage
- Update `RecentCompany` interface to include `revenue?: string` and `healthScore?: string`.
- Store these when adding to recents (data comes from the company detail fetch in page.tsx).
- Display in the recents dropdown the same way as API results.

### CompanySearchResult Type
- Add optional `revenue?: string` and `healthScore?: string` to `CompanySearchResult` in `types.ts`.

---

## 2. Hover Preview on Attention List

**Goal:** Quick glance at company details without clicking.

### Behavior
- Hovering a company row in the attention list for 300ms shows a tooltip card.
- Tooltip appears below the hovered row, left-aligned.
- Shows: Revenue, Health Score (if available), Last Contacted (if available from detail), Owner, "in group" duration.
- All data comes from the `AttentionCompany` object already on the row - no additional fetching.
- Disappears on mouse leave or on click (navigating to company).
- Does NOT show on keyboard-navigated focus (hover only).

### UI
- Small card with white background, border, subtle shadow.
- Compact layout: 2-column grid of label/value pairs.
- Max width ~280px.
- Uses `animate-fadeIn` for smooth appearance.
- Positioned with `absolute` below the row, z-index above other rows.

### Implementation
- Add `onMouseEnter`/`onMouseLeave` handlers to `CompanyRow` in `AttentionGroup.tsx`.
- Use a 300ms `setTimeout` to show the tooltip (clear on mouse leave).
- Render the tooltip as a child of the row wrapper.
- New component: `CompanyTooltip` (small, self-contained).

---

## 3. Activity Search

**Goal:** Find specific activities by keyword within a company's activity feed.

### UI
- A small search input with magnifying glass icon, placed to the left of the type filter pills.
- Placeholder: "Search activities..."
- Same height as the filter pills row.

### Behavior
- Client-side filter: matches keyword against `title`, `body`, `bodyPreview`, and `summary` fields (case-insensitive).
- Combines with existing type and date range filters (all three apply together).
- Debounce: 200ms after typing stops.
- The "Showing X activities" count updates to reflect all active filters.
- Empty search field = no keyword filter (show all matching type + date).

### Implementation
- Add `searchQuery` state to `ActivityTab`.
- Add search input to the filter row (before type pills).
- Apply keyword filter in the `filterEngagements` pipeline or as an additional filter step.
- No changes to `filter-activities.ts` needed - just filter the result array further in the component.

---

## 4. Portfolio Stats Bar

**Goal:** At-a-glance summary of your portfolio above the attention groups.

### Data
- **Total Portfolio Revenue**: Sum of all company revenue values from attention data (parse EUR strings).
- **Customer Count**: Total unique companies across all attention groups.
- **Health Distribution**: Count companies by health score category from the attention data. Note: only companies in the "health_score" attention group have explicit health data. Show what's available.

### UI
- Compact horizontal bar below the header row (after "Needs Attention" title + sort toggle).
- Three stats inline: `€142 000 total revenue · 10 companies · 2 at risk, 1 critical`
- Muted text, small font (text-xs), separated by centered dots.
- Respects My Accounts / All Accounts filter.
- Excludes snoozed companies from counts and totals.

### Implementation
- Compute stats from the `filteredGroups` data already available in `AttentionList`.
- Render as a simple `<p>` element below the summary grid (or replace it - the summary grid cards already show similar info).
- Actually: the summary grid cards already show per-signal counts. The portfolio stats bar adds **revenue total** and a text-based health summary. Render it between the summary grid and the attention groups.

---

## Technical Notes

### No New Dependencies
All features use existing stack.

### New Components
- `CompanyTooltip` - hover preview card for attention list

### Modified Files
- `src/lib/types.ts` - Add revenue/healthScore to CompanySearchResult
- `src/lib/recent-companies.ts` - Expand RecentCompany type
- `src/app/api/companies/search/route.ts` - Enrich search results
- `src/components/SearchBar.tsx` - Show enriched data in results
- `src/components/AttentionGroup.tsx` - Add hover preview
- `src/components/ActivityTab.tsx` - Add search input
- `src/components/AttentionList.tsx` - Add portfolio stats bar

### Testing
- Unit test for activity keyword filtering
- Visual verification for the rest
