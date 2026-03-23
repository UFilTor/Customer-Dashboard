# Customer Dashboard - Design Spec

## Purpose

Internal tool for the Understory CS/onboarding team to quickly look up customer information from HubSpot. Search by company name, see key metrics at a glance, and drill into details across organized tabs.

## Users

CS/onboarding team at Understory. All users have HubSpot seats.

## Tech Stack

- **Framework:** Next.js (App Router), TypeScript
- **Styling:** Tailwind CSS, Understory brand tokens
- **Testing:** Vitest
- **Hosting:** Vercel
- **Data source:** HubSpot REST API (v3)
- **Auth:** HubSpot OAuth (user login) + shared private app bearer token (API calls)

## Architecture

```
Browser -> Next.js App Router -> API Routes -> HubSpot REST API
                                     |
                              Private app bearer token
                              (shared, stored in env var)

Auth: HubSpot OAuth per user -> NextAuth.js session
```

- Server-side API routes call HubSpot using a shared bearer token from env
- In-memory cache per company (5-min TTL) to stay within HubSpot rate limits (100 req/10s)
- No database in v1. All data comes from HubSpot at request time
- Metabase integration deferred to future scope

## Authentication

- **User login:** HubSpot OAuth via NextAuth.js. Team members authenticate with their HubSpot credentials. The OAuth token is used only for identity verification, not for API calls. Required scopes: `oauth` (basic profile).
- **API access:** Single private app bearer token stored as `HUBSPOT_ACCESS_TOKEN` env var. Used server-side for all HubSpot API calls. Shared across all users. Required scopes: `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.contacts.read`, `sales-email-read`, `crm.objects.owners.read`.

## UI Layout

### Search

- Search bar in the top navigation bar
- Autocomplete dropdown as the user types (debounced 300ms)
- Calls HubSpot Search API filtering by company `name`
- Returns top 5 matches
- Selecting a result loads the company detail view
- **Empty state:** Before any search, show a centered welcome message ("Search for a company to get started")

### Company Detail View

**Header row:**
- Company name (large)
- Subtitle: domain, owner name, last contacted (relative)
- "Open in HubSpot" link

**Metric cards (4 green cards in a row):**

| Card | HubSpot Property | Source |
|------|-----------------|--------|
| MRR | `confirmed__contract_mrr` | Lifecycle deal |
| Last 12M Volume | `understory_booking_volume_last_12_months` | Company |
| Understory Pay | `understory_pay_status__customer` | Lifecycle deal |
| Invoice | `Tags` - show status with color: Overdue (red), Open (orange), Paid (green) | Lifecycle deal |

**Tabs:**

### Overview Tab

Two-column layout:

**Company Info card:**

| Label | Property | Source | Format |
|-------|----------|--------|--------|
| Domain | `domain` | Company | Link |
| Owner | `hubspot_owner_id` | Company | Resolve to name |
| Last contacted | `notes_last_contacted` | Company | Date |
| Transactions | `understory_total_number_of_transactions` | Company | Number |
| All-time volume | `understory_booking_volume_all_time` | Company | Currency |

**Lifecycle Deal card:**

| Label | Property | Source | Format |
|-------|----------|--------|--------|
| Deal name | `dealname` | Deal | Text |
| Stage | `dealstage` | Deal | Badge |
| MRR | `confirmed__contract_mrr` | Deal | Currency |
| Booking fee | `booking_fee` | Deal | Percentage |
| Understory Pay | `understory_pay_status__customer` | Deal | Text |
| Invoice status | `Tags` | Deal | Text |

Deal is filtered to pipelines where the name contains "Lifecycle". Each company has exactly one lifecycle deal.

### Activity Tab

Chronological feed of engagements from the last 90 days. Each entry shows type icon, title, body preview, timestamp, and direction/owner.

**Engagement types and properties:**

- **Calls:** `hs_call_title`, `hs_call_body`, `hs_body_preview`, `hs_call_direction`, `hs_timestamp`, `hs_call_status`
- **Meetings:** `hs_meeting_title`, `hs_meeting_body`, `hs_body_preview`, `hs_timestamp`, `hs_meeting_outcome`
- **Notes:** `hs_note_body`, `hs_timestamp`, `hubspot_owner_id`
- **Emails:** `hs_email_subject`, `hs_email_body`, `hs_timestamp`, `hs_email_from_email`, `hs_email_to_email`, `hs_email_direction`

**Email filter:** Exclude emails where subject starts with "Accepted:", "Tentative:", or "Declined:".

### Tasks Tab

List of tasks associated with the company or its deals that have future due dates. Fetched via `/crm/v3/objects/tasks` with company association.

**Task properties:**

| Label | Property | Format |
|-------|----------|--------|
| Subject | `hs_task_subject` | Text |
| Status | `hs_task_status` | Badge |
| Due date | `hs_task_due_date` | Date |
| Owner | `hubspot_owner_id` | Resolve to name |

## Field Configuration

All displayed fields are defined in a single config file (`src/config/hubspot-fields.ts`). This file maps display labels to HubSpot property names, source (company vs deal), and format type.

Adding, removing, or reordering fields requires editing only this file. The UI renders dynamically from the config. No other code changes needed.

```ts
export const dashboardConfig = {
  metricCards: [
    { label: "MRR", property: "confirmed__contract_mrr", source: "deal", format: "currency" },
    { label: "Last 12M Volume", property: "understory_booking_volume_last_12_months", source: "company", format: "currency" },
    { label: "Understory Pay", property: "understory_pay_status__customer", source: "deal", format: "text" },
    { label: "Invoice", property: "Tags", source: "deal", format: "invoiceStatus" },
  ],
  tabs: {
    overview: {
      companyInfo: [
        { label: "Domain", property: "domain", format: "link" },
        { label: "Owner", property: "hubspot_owner_id", format: "owner" },
        { label: "Last contacted", property: "notes_last_contacted", format: "date" },
        { label: "Transactions", property: "understory_total_number_of_transactions", format: "number" },
        { label: "All-time volume", property: "understory_booking_volume_all_time", format: "currency" },
      ],
      dealInfo: [
        { label: "Deal name", property: "dealname", format: "text" },
        { label: "Stage", property: "dealstage", format: "badge" },
        { label: "MRR", property: "confirmed__contract_mrr", format: "currency" },
        { label: "Booking fee", property: "booking_fee", format: "percentage" },
        { label: "Understory Pay", property: "understory_pay_status__customer", format: "text" },
        { label: "Invoice status", property: "Tags", format: "invoiceStatus" },
      ],
    },
    activity: {
      types: ["calls", "meetings", "notes", "emails"],
      daysBack: 90,
      emailSubjectFilter: ["Accepted:", "Tentative:", "Declined:"],
    },
    tasks: {
      filter: "future_due_dates",
      fields: [
        { label: "Subject", property: "hs_task_subject", format: "text" },
        { label: "Status", property: "hs_task_status", format: "badge" },
        { label: "Due date", property: "hs_task_due_date", format: "date" },
        { label: "Owner", property: "hubspot_owner_id", format: "owner" },
      ],
    },
  },
}
```

## Data Flow

### Search

1. User types in search bar (debounced 300ms)
2. API route calls HubSpot Search API (`/crm/v3/objects/companies/search`) filtering by `name`
3. Returns top 5 matches for autocomplete dropdown

### Reference Data (fetched once and cached long-term)

- **Owners:** `/crm/v3/owners` to resolve `hubspot_owner_id` to display names
- **Deal stages:** `/crm/v3/pipelines/deals` to resolve `dealstage` IDs to human-readable labels
- Cached for 1 hour (these change rarely)

### Company Detail Load

On company selection, all requests fire in parallel:

1. Fetch company properties from `/crm/v3/objects/companies/{id}`
2. Fetch associated deals, filter to pipeline containing "Lifecycle"
3. Fetch engagements (calls, meetings, notes, emails) from last 90 days
4. Fetch tasks with future due dates

### Cache

- In-memory `Map<companyId, { data, timestamp }>`
- 5-minute TTL, evicted on next request after expiry
- Covers company detail requests (not search, which should always be fresh)
- Upgrade path: swap to Vercel KV if needed, zero API changes

## Loading States

- **Search:** Subtle spinner in the search input while fetching results
- **Company detail:** Skeleton loaders for each section (metric cards, tab content) that resolve independently as parallel requests complete
- Each section loads individually so the user sees data as it arrives

## Error Handling

- **HubSpot API down/rate limited:** Banner message "Could not load data" with retry button. Page remains functional.
- **Missing properties:** Display "-" for any configured field that doesn't exist on the HubSpot object. Config file is safe to edit without risk of crashes.
- **Auth expired:** Redirect to login page with message.
- **No search results:** "No companies found" message in dropdown.

## Testing

- **Unit tests (Vitest):** Config parsing, data transformation, cache logic, format helpers
- **API route tests:** Mock HubSpot responses, verify correct property fetching and filtering
- **Manual testing:** Against real HubSpot data locally before deploy

## Out of Scope (v1)

- Metabase integration
- Write-back to HubSpot (read-only dashboard)
- Role-based permissions (all authenticated users see the same data)
- Multi-company comparison views
- Export/PDF functionality
