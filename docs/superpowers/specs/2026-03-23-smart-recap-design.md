# Smart Recap + Suggested Next Action - Design Spec

## Purpose

When a CS team member opens a customer profile, immediately surface what happened last, what was promised, and what to do next. Removes the need to read through activity history to get context before an interaction.

## Scope

This spec covers two features that share the same AI infrastructure:
1. **Smart Recap** - AI-generated summary of recent activity with key takeaways
2. **Suggested Next Action** - AI-recommended next step with a button to act in HubSpot

## UI Location

First card inside the Overview tab, above the existing Company Info and Lifecycle Deal cards. Always visible when Overview is active.

## UI Design

**Card layout:**
- Background: `var(--light-grey)` (#F8F6ED), consistent with other dashboard cards
- Border radius: `var(--border-radius)` (12px)
- Small "AI Summary" label in `var(--green-100)` at the top left
- Recap text (3-5 sentences) in `var(--dark-moss)`, Inter, regular weight
- Horizontal divider in `var(--beige-gray)`
- Suggested action row below: action text on the left, CTA button on the right
- CTA button: `var(--citrus)` background, `var(--moss)` text, 8px radius (brand button radius), font-weight 600
- Button text matches action type (e.g. "Log note in HubSpot", "Create task in HubSpot")

**Empty state (no activity):** If no engagements exist in the last 90 days, show muted text: "No recent activity to summarize."

**Error state (AI failed):** If engagements exist but the AI call fails, show: "Could not generate summary. Check the Activity tab for recent interactions."

**Loading state:** Skeleton loader matching the card dimensions while AI generates the recap.

## Recap Content

The AI generates a structured recap from the engagement history:

**Summary (3-5 sentences):**
- What was last discussed (most recent interaction)
- Any commitments or promises made by either side
- Outstanding follow-ups or open items
- How the relationship is trending (positive, neutral, needs attention)

**Suggested action:**
- A specific, actionable recommendation based on the activity pattern
- Includes an action type that determines the HubSpot link target

## Suggested Action Types and HubSpot Links

| Action Type | Button Text | HubSpot URL |
|------------|-------------|-------------|
| note | Log note in HubSpot | `https://app.hubspot.com/contacts/{portalId}/company/{companyId}#activity` |
| task | Create task in HubSpot | `https://app.hubspot.com/contacts/{portalId}/company/{companyId}#tasks` |
| meeting | Schedule meeting in HubSpot | `https://app.hubspot.com/contacts/{portalId}/company/{companyId}#meetings` |
| call | Log call in HubSpot | `https://app.hubspot.com/contacts/{portalId}/company/{companyId}#activity` |

All links open in a new tab.

## Data Flow

### Generation

Server-side, in the existing `/api/companies/[id]` route. After engagements are fetched and individually summarized, one additional Claude Haiku call generates the recap and suggested action.

### AI Input

The recap prompt receives the already-summarized engagements (from `summarizeEngagements`) plus company and deal context. The 90-day filtering is already applied by `fetchEngagements` in `hubspot.ts`, so the recap function receives pre-filtered data.

Specific properties passed to the prompt:
- Engagement summaries with types and timestamps (already generated)
- Company: `name`, `confirmed__contract_mrr` (MRR), `Health Score Category`, `notes_last_contacted`
- Deal: `dealname`, `dealstage` (resolved to label), `booking_fee`, `understory_pay_status__customer`, `Tags` (invoice status)

### AI Output (structured JSON)

```json
{
  "summary": "Last interaction was a quarterly check-in call 3 days ago...",
  "suggestedAction": {
    "text": "Follow up on the group booking demo they requested during the last call",
    "type": "task"
  }
}
```

### Response Shape

The company detail API response adds:

```ts
interface Recap {
  summary: string | null;
  suggestedAction: {
    text: string;
    type: "note" | "task" | "meeting" | "call";
  } | null;
  error?: boolean;
}

// Added to CompanyDetail
recap: Recap | null;
// null = no engagements (empty state)
// { error: true } = AI failed (error state)
// { summary, suggestedAction } = success
```

### Caching

Included in the existing 5-minute company cache. The recap does not regenerate on tab switches or page refreshes within the TTL.

### Error Handling

- No engagements in last 90 days: Skip the AI call entirely. `recap` is `null`, card shows empty state.
- AI call fails: `recap` is `{ summary: null, suggestedAction: null, error: true }`, card shows error state message.
- Malformed AI response (invalid JSON, missing fields): Same as AI failure, fall back with `error: true`, log server-side.

### Cost and Rate Limiting

Each company load makes N Haiku calls for engagement summaries + 1 for the recap. With a small CS team and 5-minute caching, this is negligible. No additional throttling needed. Rapid company switching is handled by the cache (second load within 5 min is free).

## Implementation Notes

- The recap generation function lives in `src/lib/summarize.ts` alongside the existing `summarizeEngagements` function
- The recap card is a new component: `src/components/RecapCard.tsx`
- RecapCard receives `recap`, `companyId` as props. It reads `process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID` directly (available client-side as a NEXT_PUBLIC_ var)
- The OverviewTab renders RecapCard above the existing two-column grid. OverviewTab props are extended with `recap: Recap | null` and `companyId: string`
- `page.tsx` passes `companyData.recap` and `selectedCompanyId` to OverviewTab
- Types are extended in `src/lib/types.ts`
- The AI prompt should request JSON output and parse it, with a try/catch fallback

### Mock Data for Preview

The preview page adds mock recap data:
```ts
recap: {
  summary: "Last interaction was a quarterly check-in call 3 days ago. Customer expects 40% booking growth this summer and requested a group booking demo. They are happy with Understory Pay but want better failed payment reporting. Outstanding: send group booking beta docs and schedule follow-up demo.",
  suggestedAction: {
    text: "Send group booking beta documentation and schedule a demo for next week",
    type: "task" as const,
  },
}
```

## Files Affected

- Modify: `src/lib/types.ts` (add Recap interface, add recap to CompanyDetail)
- Modify: `src/lib/summarize.ts` (add generateRecap function)
- Modify: `src/app/api/companies/[id]/route.ts` (call generateRecap after summarize)
- Create: `src/components/RecapCard.tsx`
- Modify: `src/components/OverviewTab.tsx` (render RecapCard)
- Modify: `src/app/page.tsx` (pass recap data to OverviewTab)
- Modify: `src/app/preview/page.tsx` (add mock recap data)

## Out of Scope

- Writing data back to HubSpot (all actions open HubSpot in a new tab)
- Needs attention dashboard (separate feature, separate spec)
- Quick actions beyond the suggested action link
- Booking page link (separate feature)
