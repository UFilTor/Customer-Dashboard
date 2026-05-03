# Lookup grounding & blank-result diagnostics

Date: 2026-05-02
Owner: Filip
Scope: `src/lib/search-llm.ts`, `src/lib/search.ts`, `src/components/design/views/SearchView.tsx`, plus two new modules and a small type extension.

## Problem

The Lookup view (`SearchView.tsx`, internally `Search`) returns blank results too often. A representative case:

> Query: `Companies in DK with health below 50` (one of the example chips)
> LLM spec: `country = Denmark, health_score < 50` (correct per the prompt)
> HubSpot: `0 results`

Reproduced live against `/api/search`. Each filter alone:

| filter | matches |
| --- | --- |
| `understory_company_country = Denmark` | 0 |
| `health_score < 50` | 100 |

Sampling actual records via `/api/onboarding`:

```
distinct country values: 'DE', 'DK', 'GB', 'GL', 'IT', 'NO', 'SE'
```

HubSpot stores `understory_company_country` as a **two-letter ISO code**, not a country name. The current prompt asserts the opposite:

> `understory_company_country: any country name as it appears in HubSpot ("Denmark", "Sweden", … never an ISO code like "DK")`

The LLM is doing exactly what it's told. The bug is the prompt lying about the stored values, and the user has no way of seeing the LLM's spec to debug it. Silent failure.

This spec covers two compounding fixes — Part A grounds the prompt in real HubSpot values; Part B turns silent blanks into legible, debuggable ones.

## Goals

1. The example chip `Companies in DK with health below 50` returns matches.
2. Future drift between the prompt's enum lists and HubSpot's stored values surfaces visibly the next time it bites — never silently as a blank.
3. Every search shows a one-line restatement of what was actually queried, so misreads stop being invisible.

## Non-goals

- A full retrieval-augmented agent loop with tool use (considered as Approach C, rejected as overkill for ~6 entity types and ~30 properties).
- Auto-fetching enum values from HubSpot at boot (considered, rejected — adds startup dependency and only works for true enum-typed properties; a curated file plus visible diagnostics is cheaper and self-correcting).
- Counting how many records each refinement step *eliminated* (would need an extra HubSpot call per turn). Skip for v1; revisit if asked.

## Architecture

```
User query → POST /api/search
  → buildSearchPayload
    → searchDashboard
        ├─ parseQuery        ← reads enum block from hubspot-enums.ts (Part A)
        ├─ validate
        ├─ executeTarget(s)
        └─ if results.length === 0 && spec has filters or terms:
              buildDiagnostic                         ← new (Part B)
                ├─ re-run each filter alone (parallel)
                ├─ closestMatch for failed EQ/IN filters on KNOWN_VALUES
                └─ assemble: { specSummary, filterProbes, didYouMean }
        → return { results, parsed, diagnostic }
```

### New files

- `src/lib/hubspot-enums.ts` — single source of truth for stored property values, country ISO ↔ name map, `closestMatch` helper. Imported by both the prompt builder and the diagnostics module so they cannot drift.
- `src/lib/search-diagnostics.ts` — pure module exporting `buildDiagnostic(spec, runFilterProbe) → SearchDiagnostic`. Pure: takes a probe function as input so the network boundary is mockable in tests.

### Touched files

- `src/lib/search-llm.ts` — replace inline `ENUM_VALUES_BLOCK` with content generated from `hubspot-enums.ts`. Add the country code/name rule. Update Example 2 in the few-shot block to emit `value: "DK"`.
- `src/lib/search.ts` — wire `buildDiagnostic` into the empty-result path. Add small `humaniseSpec` helper so the summary line and the empty-state panel share one renderer.
- `src/lib/search-payload.ts` — bump `CACHE_VERSION` constant in the cache key to invalidate any pre-fix blanks lingering at deploy time.
- `src/lib/types.ts` — add `SearchDiagnostic` interface; extend `SearchResponse` and `SearchOutcome` with optional `diagnostic`.
- `src/components/design/views/SearchView.tsx` — render `specSummary` always (italic line above results), replace empty-state copy with the structured diagnostic panel.

## Part A: ground-truth enums

### `hubspot-enums.ts` shape

```ts
// Single source of truth for HubSpot enum-like property values.
// Update this file when HubSpot enum lists change. Drift is what causes
// silent blank results — the diagnostics in search-diagnostics.ts surface
// drift the next time it bites.

export const COUNTRY_CODES = {
  DK: "Denmark",
  SE: "Sweden",
  NO: "Norway",
  DE: "Germany",
  IT: "Italy",
  GB: "United Kingdom",
  GL: "Greenland",
} as const;

export type CountryCode = keyof typeof COUNTRY_CODES;

// Properties whose stored values are a fixed set. Used by the prompt builder
// (so the LLM emits the exact stored string) and by the diagnostics module
// (so a 0-result EQ filter can suggest the nearest valid value).
export const KNOWN_VALUES: Record<string, readonly string[]> = {
  understory_company_country: Object.keys(COUNTRY_CODES), // ISO codes
  understory_pay_status__customer: [
    "Live", "Verified", "Pending Verification", "Started Onboarding",
    "Signed - Not Started", "Not yet enrolled", "Unwilling", "Ineligible",
  ],
  customer_stage: [
    "Started", "Adopted", "Hibernation", "Product Hold", "Established", "Churned",
  ],
  wish_to_churn: ["true", "false"],
  hs_email_direction: ["INCOMING_EMAIL", "FORWARDED_EMAIL", "EMAIL"],
  subscription_plan: ["Starter", "Grow", "Bloom", "Growth"],
};

// Returns up to topN candidates sorted by edit distance, with case-insensitive
// prefix matches boosted to the top. ~30 lines of pure JS, no library.
export function closestMatch(
  input: string,
  candidates: readonly string[],
  topN = 5,
): string[];
```

### Prompt changes

The dynamic prompt block is generated from `KNOWN_VALUES`. The country line gets one extra rule:

> `understory_company_country` is stored as a **two-letter ISO code** (`DK`, `SE`, `NO`, `DE`, `IT`, `GB`, `GL`). When the user writes a country name ("Denmark", "Sweden") or alternate form, look it up in this table: `DK→Denmark, SE→Sweden, NO→Norway, DE→Germany, IT→Italy, GB→United Kingdom, GL→Greenland`. Output the **ISO code**, not the name.

Example 2 in the few-shot block becomes:

```
Query: "Companies in DK with health score below 50"
Output:
{"targets":[{"entityType":"company","filters":[
  {"propertyName":"understory_company_country","operator":"EQ","value":"DK"},
  {"propertyName":"health_score","operator":"LT","value":"50"}
],"textSearch":null}],"ownerScope":{"kind":"all"},"limit":100}
```

### Validation

`search.ts` already validates property names against per-entity allowlists. No change there. We do **not** add strict value validation — a value missing from `KNOWN_VALUES` is allowed through and surfaced via `didYouMean` in the diagnostic. The list is meant to be advisory, not gating.

## Part B: blank-result diagnostics

### When it runs

Inside `searchDashboard`, after `executeTarget`, only if `results.length === 0` and the spec had at least one filter or text-search term. If targets is empty (LLM bailed) or an error already surfaced, skip — there is nothing to diagnose.

Cost on the happy path: zero.

### `SearchDiagnostic` shape

```ts
export interface SearchDiagnostic {
  /** Plain-English restatement of what was actually searched.
   *  Always present, even when results > 0 — rendered as an italic line
   *  above the result list. */
  specSummary: string;

  /** Per-filter probe, only on 0-result runs with 2+ filters. Each entry
   *  reports how many records that single filter would have matched. */
  filterProbes?: Array<{
    label: string;          // "country = Denmark (DK)" — produced by humaniseSpec
    propertyName: string;
    value: string;
    aloneMatched: number;   // count when this filter ran by itself
  }>;

  /** Did-you-mean: when an EQ/IN filter on a KNOWN_VALUES property
   *  returned 0 alone, surface the closest stored values. */
  didYouMean?: Array<{
    propertyName: string;
    submitted: string;
    suggestions: string[];  // top 3-5 from closestMatch()
  }>;
}
```

### Three layers

**1. `specSummary` — rendered always.** A single italic line above the result list:

- `Searched companies where country = Denmark (DK) and health_score < 50.`
- `Searched deals owned by Filip mentioning "GYG" in OB notes.`
- `Searched calls and meetings about "seasonal pricing".`

`humaniseSpec(spec)` lives in `search-diagnostics.ts` and is called for both the always-on summary and the empty-state panel. Maps owner IDs back to names via `OWNERS`, expands country ISO codes to `Name (CODE)` via `COUNTRY_CODES`, formats CONTAINS_TOKEN as `mentioning "X"`, joins multi-target queries with `and`.

**2. `filterProbes` — only when total = 0 and 2+ filters.** Re-run each filter alone in parallel via `executeTarget` with a single-filter spec. Report match count. Skipped for single-filter or text-search-only specs.

**3. `didYouMean` — only when an EQ/IN filter on a `KNOWN_VALUES` property returned 0 alone.** Compute `closestMatch(submitted, KNOWN_VALUES[prop])` (edit distance, with case-insensitive prefix matches boosted). Special-case for `understory_company_country`: if the submitted value matches a country **name** in `COUNTRY_CODES` (case-insensitive), surface that ISO code first regardless of edit distance — `"Denmark"` → `["DK", ...]`. This catches the common case where the LLM regresses to emitting the human-readable name.

### Empty-state UI

The current "No matches. Try rewinding the chain or rephrasing." block in `SearchView.tsx` becomes a structured panel (inline styles, matching the existing card vocabulary):

```
No matches.

You asked for:
Companies where country = Denmark and health_score < 50.

What we tried:
  country = Denmark    →  0 matches
  health_score < 50    →  84 matches

'Denmark' isn't a value HubSpot stores for understory_company_country.
Try: DK, SE, NO, DE, GB.
```

When `results.length > 0`, only `specSummary` renders — italic single line.

### Cost

A 2-filter blank query that triggers all three layers fires:

- 2 extra HubSpot search calls (filter probes), parallel
- 0 extra LLM calls

Added latency on the blank path: ~250-400ms. Happy path unchanged.

## Edge cases

1. **Cache poisoning by old blanks.** `buildSearchPayload` caches the full `SearchResponse` for 15 min. After deploy, an old cached blank from the pre-fix prompt could linger up to 14 min. Mitigation: add `CACHE_VERSION = 2` to the cache-key composition in `search-payload.ts`. Trivial; invalidates on deploy.

2. **`specSummary` with country.** Render as `country = Denmark (DK)` so the user sees both forms — clear feedback that the LLM mapped their phrasing to the stored code.

3. **0 results with text search only.** Filter probes don't apply; `didYouMean` doesn't apply; `specSummary` still renders. Empty-state copy: `No HubSpot records contain those terms.`

4. **Single-filter 0 result.** Probes are pointless (the one filter is the killer). Skip the per-filter section; still show `didYouMean` if applicable.

5. **Multi-target spec where some targets hit and others don't.** Diagnostic only triggers when the *combined* result set is 0. Mixed results don't need explanation.

6. **Refinement chain that empties the result.** Same diagnostic logic. The `specSummary` describes the merged spec, so the user sees what the refinement actually did. Quantifying *how many records the new turn eliminated* needs an extra HubSpot call per refinement and is deliberately out of scope for v1.

7. **Edge runtime.** Diagnostic runs in the same `runtime = "edge"` function. Levenshtein is pure JS. Probe calls reuse `searchObjectsPage`, already edge-safe.

## Testing

Unit tests live under `src/__tests__/lib/`, mirroring the existing pattern (`summarize.test.ts` mocks `@anthropic-ai/sdk`).

- `hubspot-enums.test.ts` — `closestMatch` returns expected ranking; country map round-trips both directions; `KNOWN_VALUES` is non-empty for every declared property.
- `search-diagnostics.test.ts` — given a fake spec and an injected probe function:
  - 0 results + 2 filters → `filterProbes` with both rows.
  - EQ on `understory_company_country` with `"Denmark"` and 0 alone → `didYouMean` with `DK` first.
  - Empty filters / text-search-only → no probes, no didYouMean, just summary.
  - `specSummary` covers single-filter, multi-filter, text-search, refinement chain, owner-name humanisation.
- `search-llm.test.ts` (new, small) — assert the prompt body now includes the country code/name table and that `buildPrompt` reads from `hubspot-enums.ts`. Lightweight; not testing model output.

No live HubSpot tests; `search.ts` already isolates the network boundary so the diagnostic logic is unit-testable via dependency injection.

## Manual verification

After ship, run from the dashboard:

- `Companies in DK with health below 50` → results ≥ 1, summary line shown.
- `Companies in Spain` → blank with diagnostic suggesting `DK / SE / NO / DE / IT / GB / GL`.
- `Pay-unwilling deals` → results ≥ 1, summary mentions `Unwilling`.
- Refinement chain that goes empty → diagnostic explains which filter killed it.

## Out of scope (revisit later)

- Auto-fetching property metadata from HubSpot at boot.
- Quantifying refinement-step elimination counts.
- Tool-use / agentic loop for the LLM.
- Persisting blank-query telemetry to spot recurring drift patterns.
