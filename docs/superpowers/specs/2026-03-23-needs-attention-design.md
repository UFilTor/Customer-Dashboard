# Needs Attention Dashboard - Design Spec

## Purpose

Replace the empty state on the main dashboard page with a proactive attention list that surfaces customers who need action. The CS team sees who needs attention before they even search, organized by urgency.

## UI Location

Replaces the current "Search for a company to get started" empty state on the main page. Visible whenever no company is selected. Clicking a company in the attention list loads the full company detail view (same behavior as searching and selecting).

## Signal Groups

Four groups, ordered by urgency. Each group shows up to 5 companies with a "Show all" expand if more exist.

| Priority | Group | Signal | HubSpot Query |
|----------|-------|--------|---------------|
| 1 | Overdue Invoices | Lifecycle deal `Tags` = "Overdue" | Search deals in lifecycle pipeline (`HUBSPOT_LIFECYCLE_PIPELINE_ID`) where `Tags` = "Overdue", fetch associated companies |
| 2 | Overdue Tasks | Tasks with `hs_task_due_date` in the past | Search tasks where due date < today, fetch associated companies |
| 3 | Health Score Issues | `Health Score Category` is "At Risk" or "Critical Churn Risk" | Search companies where `Health Score Category` in ["At Risk", "Critical Churn Risk"] |
| 4 | Gone Quiet | `notes_last_contacted` > 45 days ago | Search companies where `notes_last_contacted` < (today - 45 days) |

Groups with zero matches are hidden entirely.

## Health Score Values Reference

- 75+: Healthy (not flagged)
- 50+: Monitor (not flagged)
- 25+: At Risk (flagged)
- <25: Critical Churn Risk (flagged)

## UI Design

**Page layout:** Full width within the existing `max-w-6xl` container, below the nav bar.

**Section header:** "Needs Attention" as a page title in `var(--moss)`, font-weight 700, with a muted subtitle showing last refresh time (e.g. "Updated 5 minutes ago").

**Group layout:**
- Group header: signal name + count badge (e.g. "Overdue Invoices" with a small pill showing "3")
- Count badge: `var(--rust)` background with white text for the top two groups (invoices, tasks), `var(--beige)` background with `var(--moss)` text for the bottom two
- Company rows: compact cards in `var(--light-grey)` with `var(--border-radius)`

**Company row contents:**
- Company name (clickable, loads detail view)
- Signal-specific detail on the right:
  - Overdue Invoices: deal name
  - Overdue Tasks: task subject + days overdue
  - Health Score: score category value
  - Gone Quiet: "Last contacted X days ago"

**"Show all" link:** Text button below the 5th row, `var(--moss)` color, expands to show remaining companies in the group.

**Loading state:** Skeleton with 4 group placeholders, each with 3 row skeletons.

**Empty state (no issues):** If all groups return zero results, show a positive message: "All clear - no customers need immediate attention."

**Click behavior:** Clicking a company name calls `handleSelect` with a `CompanySearchResult` object constructed from the attention data: `{ id, name, domain: "" }`. The empty domain is fine since it's only used for display in the search dropdown, not in the detail view.

**Refresh button:** A small refresh icon button next to the "Updated X minutes ago" text. Clicking it clears the attention cache and re-fetches from HubSpot.

## Data Flow

### API Route

New route: `GET /api/attention`

Runs all 4 signal queries against HubSpot in parallel. Returns grouped results.

### Response Shape

```ts
interface AttentionCompany {
  id: string;
  name: string;
  detail: string;
}

interface AttentionGroup {
  signal: "overdue_invoices" | "overdue_tasks" | "health_score" | "gone_quiet";
  label: string;
  companies: AttentionCompany[];
}

interface AttentionResponse {
  groups: AttentionGroup[];
  updatedAt: string;
}
```

### HubSpot Queries

All queries use `limit: 100` (HubSpot search API max per request). Pagination is out of scope for v1 - 100 results per signal is sufficient.

**Overdue Invoices:**
1. Search deals: `POST /crm/v3/objects/deals/search` with filters: `pipeline` EQ `HUBSPOT_LIFECYCLE_PIPELINE_ID` AND `Tags` CONTAINS_TOKEN "Overdue" (Tags is a multi-select property). Properties: `dealname`.
2. For each matching deal, fetch associated company via `/crm/v3/objects/deals/{id}/associations/companies`.
3. Fetch company names via batch read.
4. Deduplicate by company ID - if a company has multiple overdue deals, show once with the first deal name.

**Overdue Tasks:**
1. Search tasks: `POST /crm/v3/objects/tasks/search` with filter: `hs_task_due_date` LT today AND `hs_task_status` NEQ "COMPLETED". Properties: `hs_task_subject`, `hs_task_due_date`.
2. For each task, fetch associated company via associations. Filter out tasks with no company association.
3. Fetch company names via batch read, calculate days overdue.
4. Deduplicate by company ID - show the most overdue task per company.

**Health Score Issues:**
1. Search companies: `POST /crm/v3/objects/companies/search` with filter: `health_score_category` (internal property name) IN ["At Risk", "Critical Churn Risk"]. Properties: `name`, `health_score_category`.
2. Note: The internal HubSpot property name may differ from the display label. Verify the actual internal name in HubSpot settings. If the property was created as a custom property, it might be `health_score_category` or another snake_case variant. The implementer should check `COMPANY_PROPERTIES` in `hubspot.ts` which currently uses `"Health Score Category"` - if that works for fetching, it should work for filtering too.

**Gone Quiet:**
1. Search companies: `POST /crm/v3/objects/companies/search` with filter: `notes_last_contacted` LT (today - 45 days). The LT operator compares the date value, so dates older than 45 days ago will match.
2. Properties: `name`, `notes_last_contacted`. Calculate days since last contact for the detail display.

### Caching

- Server-side in-memory cache with 15-minute TTL (same `Cache` class used elsewhere)
- Single cache key "attention" for the full `AttentionResponse` object
- `updatedAt` is set to `new Date().toISOString()` when the response is generated and stored inside the cached object itself
- The refresh button on the UI calls `GET /api/attention?refresh=true` which bypasses the cache

### Error Handling

- If any individual signal query fails, that group returns an empty array (other groups still show)
- If the entire API call fails, show: "Could not load attention data. Try refreshing."
- If HubSpot rate limited, the 15-min cache protects against repeated hits

## Implementation Notes

### New Files
- `src/lib/attention.ts` - HubSpot query functions for each signal type
- `src/app/api/attention/route.ts` - API route with caching
- `src/components/AttentionList.tsx` - The full attention dashboard UI
- `src/components/AttentionGroup.tsx` - Individual group with expand/collapse

### Modified Files
- `src/lib/types.ts` - Add AttentionCompany, AttentionGroup, AttentionResponse types
- `src/app/page.tsx` - Replace empty state with AttentionList, fetch attention data on mount
- `src/app/preview/page.tsx` - Add mock attention data for preview

### Data Dependencies
- Uses existing `HUBSPOT_ACCESS_TOKEN` and `HUBSPOT_LIFECYCLE_PIPELINE_ID` env vars
- Uses existing `Cache` class from `src/lib/cache.ts`
- Uses existing `headers()` pattern from `src/lib/hubspot.ts` (extract to shared utility or import)

## Out of Scope

- Renewal approaching signal (would need contract end date field, can add later)
- Notification/email alerts for attention items
- Per-user attention filtering (all team members see the same list)
- Custom thresholds for gone quiet days (hardcoded to 45)
