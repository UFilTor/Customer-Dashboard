# Smart Recap + Suggested Next Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-generated recap card to the Overview tab that summarizes recent activity and suggests a next action with a HubSpot deep link.

**Architecture:** Extends the existing summarize.ts with a `generateRecap` function that takes engagement summaries + company/deal context and returns structured JSON via Claude Haiku. The recap is generated server-side in the company detail API route, cached alongside existing data, and rendered via a new RecapCard component in the OverviewTab.

**Tech Stack:** Anthropic SDK (already installed), Claude Haiku, Next.js, TypeScript, Tailwind

**Spec:** `docs/superpowers/specs/2026-03-23-smart-recap-design.md`

---

## File Structure

```
src/
  lib/
    types.ts              # Modify: add Recap interface, add recap to CompanyDetail
    summarize.ts          # Modify: add generateRecap function
    hubspot.ts            # Modify: add recap: null to getCompanyDetail return
  app/
    api/companies/[id]/
      route.ts            # Modify: call generateRecap after summarizeEngagements
    page.tsx              # Modify: pass recap + companyId to OverviewTab
    preview/page.tsx      # Modify: add mock recap data
  components/
    RecapCard.tsx          # Create: recap card with suggested action CTA
    OverviewTab.tsx        # Modify: accept recap + companyId props, render RecapCard
    Skeleton.tsx           # Modify: add SkeletonRecap
```

---

## Task 1: Add Recap Type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add Recap interface and update CompanyDetail**

Add to `src/lib/types.ts` after the `StageMap` interface:

```ts
export type ActionType = "note" | "task" | "meeting" | "call";

export interface Recap {
  summary: string | null;
  suggestedAction: {
    text: string;
    type: ActionType;
  } | null;
  error?: boolean;
}
```

And add `recap` to the `CompanyDetail` interface:

```ts
export interface CompanyDetail {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  engagements: Engagement[];
  tasks: TaskItem[];
  recap: Recap | null;
}
```

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Errors in hubspot.ts (missing `recap` in return) and preview page (missing `recap` in mock). This is expected and will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Recap type and extend CompanyDetail"
```

---

## Task 2: Implement generateRecap

**Files:**
- Modify: `src/lib/summarize.ts`
- Create: `src/__tests__/lib/summarize.test.ts`

- [ ] **Step 1: Write failing test for generateRecap**

Create `src/__tests__/lib/summarize.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __mockCreate: mockCreate,
  };
});

import { generateRecap } from "@/lib/summarize";
import type { Engagement } from "@/lib/types";

const { __mockCreate: mockCreate } = await import("@anthropic-ai/sdk") as { __mockCreate: ReturnType<typeof vi.fn> };

const mockEngagement: Engagement = {
  type: "call",
  title: "Quarterly check-in",
  body: "Discussed upcoming season",
  bodyPreview: "Discussed upcoming season",
  summary: "Customer expects growth and wants group booking demo.",
  timestamp: String(Date.now()),
  direction: "OUTBOUND",
};

describe("generateRecap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no engagements provided", async () => {
    const result = await generateRecap([], {}, null, {}, {});
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns recap with summary and suggested action on success", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: "text",
        text: JSON.stringify({
          summary: "Last call discussed growth plans.",
          suggestedAction: { text: "Send demo docs", type: "task" },
        }),
      }],
    });

    const result = await generateRecap(
      [mockEngagement],
      { name: "Acme", confirmed__contract_mrr: "2400" },
      { dealname: "Acme Pro", dealstage: "Active" },
      { "1": "Filip K." },
      { "123": "Active Customer" }
    );

    expect(result).toEqual({
      summary: "Last call discussed growth plans.",
      suggestedAction: { text: "Send demo docs", type: "task" },
    });
  });

  it("returns error recap when AI call fails", async () => {
    mockCreate.mockRejectedValueOnce(new Error("API error"));

    const result = await generateRecap(
      [mockEngagement],
      { name: "Acme" },
      null,
      {},
      {}
    );

    expect(result).toEqual({
      summary: null,
      suggestedAction: null,
      error: true,
    });
  });

  it("returns error recap when AI returns invalid JSON", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "not valid json" }],
    });

    const result = await generateRecap(
      [mockEngagement],
      { name: "Acme" },
      null,
      {},
      {}
    );

    expect(result).toEqual({
      summary: null,
      suggestedAction: null,
      error: true,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/summarize.test.ts`
Expected: FAIL - generateRecap is not exported

- [ ] **Step 3: Implement generateRecap**

First, update the import at the top of `src/lib/summarize.ts` from:
```ts
import { Engagement } from "./types";
```
to:
```ts
import { Engagement, Recap, OwnerMap, StageMap } from "./types";
```

Then add the following function to the bottom of `src/lib/summarize.ts`. It uses the existing module-level `client` (Anthropic instance) and `stripHtml` function that are already defined at the top of the file.

export async function generateRecap(
  engagements: Engagement[],
  company: Record<string, string>,
  deal: Record<string, string> | null,
  owners: OwnerMap,
  stages: StageMap
): Promise<Recap | null> {
  if (engagements.length === 0) return null;

  const activitySummary = engagements
    .slice(0, 10)
    .map((e) => {
      const date = new Date(parseInt(e.timestamp) || e.timestamp);
      const dateStr = isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString("sv-SE");
      const ownerName = e.owner ? (owners[e.owner] || e.owner) : "";
      return `[${e.type.toUpperCase()}] ${dateStr} - ${e.title}${ownerName ? ` (${ownerName})` : ""}\nSummary: ${e.summary || stripHtml(e.body).slice(0, 200)}`;
    })
    .join("\n\n");

  const dealStage = deal?.dealstage ? (stages[deal.dealstage] || deal.dealstage) : "Unknown";

  const context = [
    `Company: ${company.name || "Unknown"}`,
    `MRR: ${deal?.confirmed__contract_mrr || "Unknown"}`,
    `Health Score: ${company["Health Score Category"] || "Unknown"}`,
    `Last contacted: ${company.notes_last_contacted || "Unknown"}`,
    deal ? `Deal: ${deal.dealname || "Unknown"} (Stage: ${dealStage})` : "No active deal",
    deal?.booking_fee ? `Booking fee: ${deal.booking_fee}%` : "",
    deal?.understory_pay_status__customer ? `Understory Pay: ${deal.understory_pay_status__customer}` : "",
    deal?.Tags ? `Invoice: ${deal.Tags}` : "",
  ].filter(Boolean).join("\n");

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are analyzing a customer's recent activity for a CS team dashboard. Based on the activity history and company context below, generate:

1. A summary (3-5 sentences): What was last discussed, any commitments or promises made, outstanding follow-ups, and how the relationship is trending.
2. A suggested next action: A specific, actionable recommendation. Include an action type: "note", "task", "meeting", or "call".

Respond with ONLY valid JSON in this exact format:
{"summary": "...", "suggestedAction": {"text": "...", "type": "note|task|meeting|call"}}

COMPANY CONTEXT:
${context}

RECENT ACTIVITY (newest first):
${activitySummary}`,
        },
      ],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      return { summary: null, suggestedAction: null, error: true };
    }

    const parsed = JSON.parse(block.text);
    if (!parsed.summary || !parsed.suggestedAction?.text || !parsed.suggestedAction?.type) {
      return { summary: null, suggestedAction: null, error: true };
    }

    return {
      summary: parsed.summary,
      suggestedAction: {
        text: parsed.suggestedAction.text,
        type: parsed.suggestedAction.type,
      },
    };
  } catch {
    console.error("Failed to generate recap");
    return { summary: null, suggestedAction: null, error: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/summarize.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/summarize.ts src/__tests__/lib/summarize.test.ts
git commit -m "feat: add generateRecap function with structured JSON output"
```

---

## Task 3: Wire Recap into API Route and Fix CompanyDetail

**Files:**
- Modify: `src/app/api/companies/[id]/route.ts`
- Modify: `src/lib/hubspot.ts` (add `recap: null` to getCompanyDetail return)

- [ ] **Step 1: Add recap: null to getCompanyDetail return**

In `src/lib/hubspot.ts`, update the `getCompanyDetail` return to include `recap: null`:

```ts
  return {
    company: companyRes,
    deal: dealResult?.properties || null,
    engagements: engagementsRes,
    tasks: tasksRes,
    recap: null,
  };
```

- [ ] **Step 2: Update API route to generate recap**

In `src/app/api/companies/[id]/route.ts`, add import:

```ts
import { summarizeEngagements, generateRecap } from "@/lib/summarize";
```

Then update the try block to call generateRecap after summarizeEngagements. The recap needs owners and stages for context, so restructure to:

```ts
  try {
    const detail = await getCompanyDetail(id);

    const [owners, stages] = await Promise.all([
      getCachedOwners(),
      getCachedStages(),
    ]);

    detail.engagements = await summarizeEngagements(detail.engagements);
    detail.recap = await generateRecap(
      detail.engagements,
      detail.company,
      detail.deal,
      owners,
      stages
    );

    companyCache.set(id, detail);

    return NextResponse.json({ ...detail, owners, stages });
  } catch {
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: May still show errors in preview page (missing recap in mock). That's fine, fixed in Task 5.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (the hubspot test mocks don't return recap, but the type allows null)

- [ ] **Step 5: Commit**

```bash
git add src/lib/hubspot.ts src/app/api/companies/[id]/route.ts
git commit -m "feat: wire generateRecap into company detail API route"
```

---

## Task 4: Create RecapCard Component

**Files:**
- Create: `src/components/RecapCard.tsx`
- Modify: `src/components/Skeleton.tsx` (add SkeletonRecap)

- [ ] **Step 1: Create RecapCard**

Create `src/components/RecapCard.tsx`:

```tsx
import { Recap, ActionType } from "@/lib/types";

interface Props {
  recap: Recap | null;
  companyId: string;
}

const ACTION_LABELS: Record<ActionType, string> = {
  note: "Log note in HubSpot",
  task: "Create task in HubSpot",
  meeting: "Schedule meeting in HubSpot",
  call: "Log call in HubSpot",
};

const ACTION_HASHES: Record<ActionType, string> = {
  note: "#activity",
  task: "#tasks",
  meeting: "#meetings",
  call: "#activity",
};

export function RecapCard({ recap, companyId }: Props) {
  const portalId = process.env.NEXT_PUBLIC_HUBSPOT_PORTAL_ID;

  if (recap === null) {
    return (
      <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4 mb-4">
        <p className="text-[var(--green-100)] text-sm">No recent activity to summarize.</p>
      </div>
    );
  }

  if (recap.error) {
    return (
      <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4 mb-4">
        <p className="text-[var(--green-100)] text-sm">
          Could not generate summary. Check the Activity tab for recent interactions.
        </p>
      </div>
    );
  }

  const hubspotUrl = portalId && recap.suggestedAction
    ? `https://app.hubspot.com/contacts/${portalId}/company/${companyId}${ACTION_HASHES[recap.suggestedAction.type]}`
    : null;

  return (
    <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4 mb-4">
      <span className="text-xs text-[var(--green-100)] uppercase tracking-wide">AI Summary</span>
      <p className="text-sm text-[var(--dark-moss)] mt-2 leading-relaxed">
        {recap.summary}
      </p>

      {recap.suggestedAction && (
        <>
          <div className="border-t border-[var(--beige-gray)] my-3" />
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--moss)] font-medium flex-1">
              {recap.suggestedAction.text}
            </p>
            {hubspotUrl && (
              <a
                href={hubspotUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 bg-[var(--citrus)] text-[var(--moss)] px-4 py-2 rounded-[8px] text-sm font-semibold hover:bg-[var(--lichen)] transition-all duration-200 inline-flex items-center gap-1"
              >
                {ACTION_LABELS[recap.suggestedAction.type]}
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add SkeletonRecap to Skeleton.tsx**

Add to `src/components/Skeleton.tsx`:

```tsx
export function SkeletonRecap() {
  return (
    <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4 mb-4 animate-pulse">
      <div className="h-3 w-20 bg-[var(--beige-gray)] rounded mb-3" />
      <div className="space-y-2">
        <div className="h-4 w-full bg-[var(--beige-gray)] rounded" />
        <div className="h-4 w-3/4 bg-[var(--beige-gray)] rounded" />
        <div className="h-4 w-5/6 bg-[var(--beige-gray)] rounded" />
      </div>
      <div className="border-t border-[var(--beige-gray)] my-3" />
      <div className="flex justify-between items-center">
        <div className="h-4 w-1/2 bg-[var(--beige-gray)] rounded" />
        <div className="h-8 w-36 bg-[var(--beige-gray)] rounded-[8px]" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

Run: `npx tsc --noEmit 2>&1 | head -20`
Expected: Clean or only preview page errors remaining

- [ ] **Step 4: Commit**

```bash
git add src/components/RecapCard.tsx src/components/Skeleton.tsx
git commit -m "feat: add RecapCard component and SkeletonRecap loader"
```

---

## Task 5: Wire RecapCard into OverviewTab and Pages

**Files:**
- Modify: `src/components/OverviewTab.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/preview/page.tsx`

- [ ] **Step 1: Update OverviewTab to accept and render recap**

Update `src/components/OverviewTab.tsx` props and render:

```tsx
import { dashboardConfig } from "@/config/hubspot-fields";
import { FieldRenderer } from "./FieldRenderer";
import { RecapCard } from "./RecapCard";
import { OwnerMap, StageMap, Recap } from "@/lib/types";

interface Props {
  company: Record<string, string>;
  deal: Record<string, string> | null;
  owners: OwnerMap;
  stages: StageMap;
  recap: Recap | null;
  companyId: string;
}

export function OverviewTab({ company, deal, owners, stages, recap, companyId }: Props) {
  function resolveValue(property: string, source: Record<string, string> | null, format: string): string | null {
    const raw = source?.[property] ?? null;
    if (!raw) return null;
    if (format === "owner") return owners[raw] || raw;
    if (format === "badge" && property === "dealstage") return stages[raw] || raw;
    return raw;
  }

  return (
    <div>
      <RecapCard recap={recap} companyId={companyId} />
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4">
          <h3 className="font-semibold text-[var(--moss)] mb-3">Company Info</h3>
          <div className="space-y-2">
            {dashboardConfig.tabs.overview.companyInfo.map((field) => (
              <div key={field.property} className="flex justify-between text-sm">
                <span className="text-[var(--green-100)]">{field.label}</span>
                <FieldRenderer
                  value={resolveValue(field.property, company, field.format)}
                  format={field.format}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--light-grey)] rounded-[var(--border-radius)] p-4">
          <h3 className="font-semibold text-[var(--moss)] mb-3">Lifecycle Deal</h3>
          {deal ? (
            <div className="space-y-2">
              {dashboardConfig.tabs.overview.dealInfo.map((field) => (
                <div key={field.property} className="flex justify-between text-sm">
                  <span className="text-[var(--green-100)]">{field.label}</span>
                  <FieldRenderer
                    value={resolveValue(field.property, deal, field.format)}
                    format={field.format}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[var(--green-100)] text-sm">No lifecycle deal found</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update page.tsx loading state and OverviewTab props**

In `src/app/page.tsx`, add `SkeletonRecap` to the import from Skeleton:

```tsx
import { SkeletonCard, SkeletonBlock, SkeletonRecap } from "@/components/Skeleton";
```

Add `<SkeletonRecap />` above the existing skeleton grid in the loading state:

```tsx
          {isLoading && (
            <div>
              <div className="mb-4 animate-pulse">
                <div className="h-8 w-64 bg-[var(--beige-gray)] rounded mb-2" />
                <div className="h-4 w-96 bg-[var(--beige-gray)] rounded" />
              </div>
              <div className="grid grid-cols-5 gap-3 mb-6">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
              <SkeletonRecap />
              <div className="grid grid-cols-2 gap-4">
                <SkeletonBlock />
                <SkeletonBlock />
              </div>
            </div>
          )}
```

Also update the OverviewTab usage:

```tsx
                      <OverviewTab
                        company={companyData.company}
                        deal={companyData.deal}
                        owners={companyData.owners}
                        stages={companyData.stages}
                        recap={companyData.recap}
                        companyId={selectedCompanyId!}
                      />
```

- [ ] **Step 3: Update preview page with mock recap data**

In `src/app/preview/page.tsx`, add `recap` to `MOCK_DATA`:

```ts
  recap: {
    summary: "Last interaction was a quarterly check-in call 3 days ago. Customer expects 40% booking growth this summer and requested a group booking demo. They are happy with Understory Pay but want better failed payment reporting. Outstanding: send group booking beta docs and schedule follow-up demo.",
    suggestedAction: {
      text: "Send group booking beta documentation and schedule a demo for next week",
      type: "task" as const,
    },
  },
```

And update the OverviewTab in preview to pass the new props:

```tsx
                      <OverviewTab
                        company={MOCK_DATA.company}
                        deal={MOCK_DATA.deal}
                        owners={MOCK_DATA.owners}
                        stages={MOCK_DATA.stages}
                        recap={MOCK_DATA.recap}
                        companyId="12345"
                      />
```

- [ ] **Step 4: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean, no errors

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Verify preview page in browser**

Run: `npm run dev` (if not already running)
Navigate to `http://localhost:3001/preview`, click "Load mock data".
Expected: RecapCard appears above the Company Info and Lifecycle Deal cards with the AI Summary label, recap text, divider, and a citrus "Create task in HubSpot" button.

- [ ] **Step 7: Commit**

```bash
git add src/components/OverviewTab.tsx src/app/page.tsx src/app/preview/page.tsx
git commit -m "feat: wire RecapCard into OverviewTab with mock data in preview"
```

---

## Task 6: Final Verification

**Files:**
- None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Verify preview manually**

Navigate to `http://localhost:3001/preview`, load mock data.
Verify:
- RecapCard shows at top of Overview tab
- "AI Summary" label in muted green
- Summary text in dark moss
- Divider line
- Suggested action text with citrus CTA button
- Button text says "Create task in HubSpot"
- All other dashboard features still work (metric cards, tabs, activity, tasks)
