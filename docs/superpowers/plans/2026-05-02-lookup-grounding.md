# Lookup grounding & blank-result diagnostics — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Project commit policy:** Filip's CLAUDE.md says code changes alone never trigger a commit. The commit step at the end of each task is **paused until Filip says "commit" or "ship"**. Implement and verify locally first; batch the commits after manual verification.

**Goal:** Eliminate silent blank results in the Lookup view by grounding the LLM prompt in real HubSpot stored values and turning every search into a visible, debuggable trace.

**Architecture:** Two new modules (`hubspot-enums.ts`, `search-diagnostics.ts`) share constants between the prompt builder and a post-search diagnostic step. Diagnostic re-runs each filter alone on 0-result paths and surfaces "did you mean" hints from the same constants the prompt was built from. Cache key gains a version suffix so the deploy invalidates pre-fix blanks.

**Tech stack:** Next.js (App Router) edge route, TypeScript, Vitest, Anthropic SDK (Haiku 4.5), HubSpot REST search API.

**Spec:** [`docs/superpowers/specs/2026-05-02-lookup-grounding-design.md`](../specs/2026-05-02-lookup-grounding-design.md)

---

## File map

| Path | Status | Responsibility |
| --- | --- | --- |
| `src/lib/hubspot-enums.ts` | new | `COUNTRY_CODES`, `KNOWN_VALUES`, `closestMatch`, `humaniseValue` |
| `src/lib/search-diagnostics.ts` | new | `humaniseSpec`, `buildDiagnostic` (DI'd probe fn) |
| `src/lib/search-llm.ts` | modify | replace `ENUM_VALUES_BLOCK` with content from `hubspot-enums.ts`; add country code rule; update Example 2 |
| `src/lib/search.ts` | modify | call `buildDiagnostic` on empty results; pass `executeTarget` as the probe fn |
| `src/lib/search-payload.ts` | modify | bump `CACHE_VERSION = 2` into the cache key |
| `src/lib/types.ts` | modify | add `SearchDiagnostic`; extend `SearchResponse`, `SearchOutcome` |
| `src/components/design/views/SearchView.tsx` | modify | render `specSummary` always, replace empty-state with structured panel |
| `src/__tests__/lib/hubspot-enums.test.ts` | new | unit tests for `closestMatch`, country round-trip, KNOWN_VALUES sanity |
| `src/__tests__/lib/search-diagnostics.test.ts` | new | unit tests for `humaniseSpec` and `buildDiagnostic` |
| `src/__tests__/lib/search-llm-prompt.test.ts` | new | smoke test that the built prompt body references `hubspot-enums.ts` content |

---

## Task 1: `hubspot-enums.ts` constants + `closestMatch`

**Files:**
- Create: `src/lib/hubspot-enums.ts`
- Test: `src/__tests__/lib/hubspot-enums.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/hubspot-enums.test.ts
import { describe, it, expect } from "vitest";
import {
  COUNTRY_CODES,
  KNOWN_VALUES,
  closestMatch,
  humaniseValue,
} from "@/lib/hubspot-enums";

describe("COUNTRY_CODES", () => {
  it("maps ISO codes to friendly names", () => {
    expect(COUNTRY_CODES.DK).toBe("Denmark");
    expect(COUNTRY_CODES.SE).toBe("Sweden");
    expect(COUNTRY_CODES.IT).toBe("Italy");
  });
});

describe("KNOWN_VALUES", () => {
  it("uses ISO codes for country (matches HubSpot's actual storage)", () => {
    expect(KNOWN_VALUES.understory_company_country).toContain("DK");
    expect(KNOWN_VALUES.understory_company_country).not.toContain("Denmark");
  });

  it("includes Unwilling for pay status", () => {
    expect(KNOWN_VALUES.understory_pay_status__customer).toContain("Unwilling");
  });

  it("has non-empty arrays for every declared property", () => {
    for (const [prop, vals] of Object.entries(KNOWN_VALUES)) {
      expect(vals.length, `${prop} should have values`).toBeGreaterThan(0);
    }
  });
});

describe("closestMatch", () => {
  it("special-cases country names → ISO codes", () => {
    const out = closestMatch("Denmark", KNOWN_VALUES.understory_company_country, 5, "understory_company_country");
    expect(out[0]).toBe("DK");
  });

  it("special-cases country names case-insensitively", () => {
    const out = closestMatch("denmark", KNOWN_VALUES.understory_company_country, 5, "understory_company_country");
    expect(out[0]).toBe("DK");
  });

  it("ranks prefix matches above pure edit distance", () => {
    const out = closestMatch("Liv", ["Live", "Verified", "Ineligible"], 3);
    expect(out[0]).toBe("Live");
  });

  it("returns up to topN candidates", () => {
    const out = closestMatch("xyz", ["a", "b", "c", "d", "e", "f"], 3);
    expect(out.length).toBe(3);
  });

  it("handles empty candidates without throwing", () => {
    expect(closestMatch("anything", [])).toEqual([]);
  });
});

describe("humaniseValue", () => {
  it("expands country ISO codes to Name (CODE)", () => {
    expect(humaniseValue("understory_company_country", "DK")).toBe("Denmark (DK)");
  });

  it("returns the raw value for non-country properties", () => {
    expect(humaniseValue("customer_stage", "Started")).toBe("Started");
  });

  it("returns the raw value for unknown country codes", () => {
    expect(humaniseValue("understory_company_country", "ZZ")).toBe("ZZ");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/hubspot-enums.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `hubspot-enums.ts`**

```ts
// src/lib/hubspot-enums.ts
// Single source of truth for HubSpot enum-like property values.
// Update when HubSpot enum lists change. Drift between this file and
// HubSpot's stored values is what causes silent blank Lookup results —
// search-diagnostics.ts surfaces drift the next time it bites.

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

// Properties whose stored values are a fixed set. The prompt builder injects
// these so the LLM emits the exact stored string; the diagnostics module uses
// them so a 0-result EQ filter can suggest the nearest valid value.
export const KNOWN_VALUES: Record<string, readonly string[]> = {
  understory_company_country: Object.keys(COUNTRY_CODES),
  understory_pay_status__customer: [
    "Live",
    "Verified",
    "Pending Verification",
    "Started Onboarding",
    "Signed - Not Started",
    "Not yet enrolled",
    "Unwilling",
    "Ineligible",
  ],
  customer_stage: [
    "Started",
    "Adopted",
    "Hibernation",
    "Product Hold",
    "Established",
    "Churned",
  ],
  wish_to_churn: ["true", "false"],
  hs_email_direction: ["INCOMING_EMAIL", "FORWARDED_EMAIL", "EMAIL"],
  subscription_plan: ["Starter", "Grow", "Bloom", "Growth"],
};

// Render a stored value back into something a human reads quickly.
// Currently only does country-code expansion; extend if other properties
// need it later.
export function humaniseValue(propertyName: string, value: string): string {
  if (propertyName === "understory_company_country") {
    const name = (COUNTRY_CODES as Record<string, string>)[value];
    return name ? `${name} (${value})` : value;
  }
  return value;
}

// Edit-distance-based candidate ranking with two boosts:
//   1. Exact case-insensitive match → top of list.
//   2. Case-insensitive prefix match → boosted above pure edit distance.
//   3. (Country only) When the input matches a friendly country name, the
//      corresponding ISO code is moved to position 0 regardless of distance.
export function closestMatch(
  input: string,
  candidates: readonly string[],
  topN = 5,
  propertyName?: string,
): string[] {
  if (candidates.length === 0) return [];
  const lowerInput = input.toLowerCase().trim();

  // Country special-case: name → code.
  let forced: string | null = null;
  if (propertyName === "understory_company_country") {
    for (const [code, name] of Object.entries(COUNTRY_CODES)) {
      if (name.toLowerCase() === lowerInput) {
        forced = code;
        break;
      }
    }
  }

  const scored = candidates.map((c) => {
    const lc = c.toLowerCase();
    let score = levenshtein(lowerInput, lc);
    if (lc === lowerInput) score = -100;
    else if (lc.startsWith(lowerInput) || lowerInput.startsWith(lc)) score -= 50;
    return { c, score };
  });
  scored.sort((a, b) => a.score - b.score);
  const ordered = scored.map((s) => s.c);

  if (forced) {
    const without = ordered.filter((c) => c !== forced);
    return [forced, ...without].slice(0, topN);
  }
  return ordered.slice(0, topN);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev: number[] = Array(b.length + 1).fill(0).map((_, i) => i);
  const curr: number[] = Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/hubspot-enums.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Pause for commit (deferred)**

Stage changes but do not commit until Filip says "commit":
```bash
git add src/lib/hubspot-enums.ts src/__tests__/lib/hubspot-enums.test.ts
```

---

## Task 2: Add `SearchDiagnostic` type + extend `SearchResponse` / `SearchOutcome`

**Files:**
- Modify: `src/lib/types.ts` (append to the search-related block ~line 600-617)

- [ ] **Step 1: Add type to `types.ts`**

Append to the search section:

```ts
// Diagnostic block — surfaced by search-diagnostics.ts, rendered by SearchView.
// `specSummary` is always present; the rest are populated only on the
// blank-result path so the user sees which filter killed the query.
export interface SearchDiagnostic {
  /** Plain-English restatement of what was searched. Always present. */
  specSummary: string;
  /** Per-filter probe results — only on 0-result runs with 2+ filters. */
  filterProbes?: Array<{
    label: string;
    propertyName: string;
    value: string;
    aloneMatched: number;
  }>;
  /** Did-you-mean hints — only when an EQ/IN filter on a known-values
   *  property returned 0 alone. */
  didYouMean?: Array<{
    propertyName: string;
    submitted: string;
    suggestions: string[];
  }>;
}
```

Then extend `SearchResponse`:

```ts
export interface SearchResponse {
  results: SearchResult[];
  parsed: SearchSpec | null;
  latencyMs: number;
  error?: string;
  diagnostic?: SearchDiagnostic;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Pause for commit (deferred)**

```bash
git add src/lib/types.ts
```

---

## Task 3: `search-diagnostics.ts` — `humaniseSpec` + `buildDiagnostic`

**Files:**
- Create: `src/lib/search-diagnostics.ts`
- Test: `src/__tests__/lib/search-diagnostics.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/lib/search-diagnostics.test.ts
import { describe, it, expect, vi } from "vitest";
import { humaniseSpec, buildDiagnostic } from "@/lib/search-diagnostics";
import type { SearchSpec } from "@/lib/types";

const filipId = "1939229547";

function spec(partial: Partial<SearchSpec>): SearchSpec {
  return {
    targets: [],
    ownerScope: { kind: "all" },
    limit: 100,
    ...partial,
  };
}

describe("humaniseSpec", () => {
  it("renders single-target with country expansion", () => {
    const s = spec({
      targets: [
        {
          entityType: "company",
          filters: [
            { propertyName: "understory_company_country", operator: "EQ", value: "DK" },
            { propertyName: "health_score", operator: "LT", value: "50" },
          ],
          textSearch: null,
        },
      ],
    });
    expect(humaniseSpec(s)).toBe(
      "Searched companies where country = Denmark (DK) and health_score < 50."
    );
  });

  it("maps owner IDs back to names", () => {
    const s = spec({
      targets: [
        {
          entityType: "deal",
          filters: [
            { propertyName: "hubspot_owner_id", operator: "EQ", value: filipId },
          ],
          textSearch: null,
        },
      ],
    });
    expect(humaniseSpec(s)).toBe("Searched deals owned by Filip.");
  });

  it("formats CONTAINS_TOKEN as 'mentioning'", () => {
    const s = spec({
      targets: [
        {
          entityType: "deal",
          filters: [],
          textSearch: { terms: ["GYG"], fields: ["ob_note___customer_needs_"] },
        },
      ],
    });
    expect(humaniseSpec(s)).toContain('mentioning "GYG"');
  });

  it("joins multi-target with 'and'", () => {
    const s = spec({
      targets: [
        { entityType: "call", filters: [], textSearch: { terms: ["pricing"], fields: ["hs_call_body"] } },
        { entityType: "meeting", filters: [], textSearch: { terms: ["pricing"], fields: ["hs_meeting_body"] } },
      ],
    });
    const out = humaniseSpec(s);
    expect(out).toContain("calls");
    expect(out).toContain("meetings");
    expect(out).toContain(" and ");
  });
});

describe("buildDiagnostic", () => {
  const blankProbe = vi.fn(async () => 0);

  it("returns specSummary even when there are no filters", async () => {
    const s = spec({
      targets: [
        { entityType: "company", filters: [], textSearch: null },
      ],
    });
    const d = await buildDiagnostic(s, blankProbe);
    expect(d.specSummary).toMatch(/^Searched companies/);
    expect(d.filterProbes).toBeUndefined();
    expect(d.didYouMean).toBeUndefined();
  });

  it("runs per-filter probes when total = 0 and 2+ filters", async () => {
    const probe = vi.fn(async (entity: string, propertyName: string) => {
      if (propertyName === "understory_company_country") return 0;
      if (propertyName === "health_score") return 84;
      return 0;
    });
    const s = spec({
      targets: [
        {
          entityType: "company",
          filters: [
            { propertyName: "understory_company_country", operator: "EQ", value: "Denmark" },
            { propertyName: "health_score", operator: "LT", value: "50" },
          ],
          textSearch: null,
        },
      ],
    });
    const d = await buildDiagnostic(s, probe);
    expect(d.filterProbes).toHaveLength(2);
    const country = d.filterProbes!.find((f) => f.propertyName === "understory_company_country");
    expect(country?.aloneMatched).toBe(0);
    const health = d.filterProbes!.find((f) => f.propertyName === "health_score");
    expect(health?.aloneMatched).toBe(84);
  });

  it("emits didYouMean for failed EQ on a known-values property", async () => {
    const probe = vi.fn(async () => 0);
    const s = spec({
      targets: [
        {
          entityType: "company",
          filters: [
            { propertyName: "understory_company_country", operator: "EQ", value: "Denmark" },
            { propertyName: "health_score", operator: "LT", value: "50" },
          ],
          textSearch: null,
        },
      ],
    });
    const d = await buildDiagnostic(s, probe);
    expect(d.didYouMean).toBeDefined();
    expect(d.didYouMean![0].propertyName).toBe("understory_company_country");
    expect(d.didYouMean![0].suggestions[0]).toBe("DK");
  });

  it("skips per-filter probes when only one filter exists", async () => {
    const probe = vi.fn(async () => 0);
    const s = spec({
      targets: [
        {
          entityType: "company",
          filters: [
            { propertyName: "understory_company_country", operator: "EQ", value: "Spain" },
          ],
          textSearch: null,
        },
      ],
    });
    const d = await buildDiagnostic(s, probe);
    expect(d.filterProbes).toBeUndefined();
    expect(d.didYouMean).toBeDefined();
  });

  it("skips entirely when targets is empty", async () => {
    const probe = vi.fn(async () => 0);
    const d = await buildDiagnostic(spec({}), probe);
    expect(d.specSummary).toBe("");
    expect(probe).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/__tests__/lib/search-diagnostics.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement `search-diagnostics.ts`**

```ts
// src/lib/search-diagnostics.ts
// Post-search diagnostic: turn invisible blank results into a legible trace.
// Always emits specSummary; on 0-result paths re-runs each filter alone and
// surfaces did-you-mean hints sourced from hubspot-enums.ts.
//
// The probe function is injected (rather than imported) so tests don't have
// to mock the HubSpot network layer — search.ts wires in a probe that calls
// executeTarget with a single-filter spec.

import { OWNER_MAP } from "./owners";
import { KNOWN_VALUES, closestMatch, humaniseValue } from "./hubspot-enums";
import type {
  SearchDiagnostic,
  SearchSpec,
  SearchTarget,
  SearchEntityType,
} from "./types";

// (entity, propertyName, operator, value) → match count for that filter alone.
export type FilterProbe = (
  entity: SearchEntityType,
  propertyName: string,
  operator: string,
  value: string,
) => Promise<number>;

const ENTITY_LABEL: Record<SearchEntityType, string> = {
  deal: "deals",
  company: "companies",
  note: "notes",
  meeting: "meetings",
  call: "calls",
  email: "emails",
};

const FILTER_VERB: Record<string, string> = {
  EQ: "=",
  NEQ: "≠",
  GT: ">",
  LT: "<",
  GTE: "≥",
  LTE: "≤",
  IN: "in",
  NOT_IN: "not in",
  BETWEEN: "between",
  CONTAINS_TOKEN: "contains",
  HAS_PROPERTY: "has",
};

// owner / country / regular field — we group these so the rendered sentence
// reads naturally instead of like a JSON dump.
function humaniseFilter(propertyName: string, operator: string, value: string): string {
  if (propertyName === "hubspot_owner_id" && operator === "EQ") {
    const owner = OWNER_MAP[value];
    return owner ? `owned by ${owner.name}` : `owner = ${value}`;
  }
  const verb = FILTER_VERB[operator] ?? operator;
  const shownValue = humaniseValue(propertyName, value);
  const shownProp = propertyName === "understory_company_country" ? "country" : propertyName;
  return `${shownProp} ${verb} ${shownValue}`;
}

function humaniseTextSearch(terms: string[]): string {
  if (terms.length === 1) return `mentioning "${terms[0]}"`;
  const inner = terms.map((t) => `"${t}"`).join(" or ");
  return `mentioning ${inner}`;
}

function humaniseTarget(t: SearchTarget): string {
  const entity = ENTITY_LABEL[t.entityType];
  const parts: string[] = [];

  // Owner-only filter reads as "owned by X" — pull it out of the where-clause.
  const ownerFilter = t.filters.find(
    (f) => f.propertyName === "hubspot_owner_id" && f.operator === "EQ",
  );
  const otherFilters = t.filters.filter((f) => f !== ownerFilter);

  if (ownerFilter) parts.push(humaniseFilter(ownerFilter.propertyName, ownerFilter.operator, ownerFilter.value));

  if (otherFilters.length > 0) {
    const clause = otherFilters
      .map((f) => humaniseFilter(f.propertyName, f.operator, f.value))
      .join(" and ");
    parts.push(`where ${clause}`);
  }

  if (t.textSearch && t.textSearch.terms.length > 0) {
    parts.push(humaniseTextSearch(t.textSearch.terms));
  }

  return parts.length === 0 ? entity : `${entity} ${parts.join(" ")}`;
}

export function humaniseSpec(spec: SearchSpec): string {
  if (!spec.targets || spec.targets.length === 0) return "";
  const parts = spec.targets.map(humaniseTarget);
  return `Searched ${parts.join(" and ")}.`;
}

const PROBE_OPERATORS = new Set([
  "EQ", "NEQ", "GT", "LT", "GTE", "LTE", "IN", "NOT_IN", "BETWEEN", "HAS_PROPERTY",
]);

// Probe-eligible filters are the ones where a single-filter rerun makes sense.
// CONTAINS_TOKEN is excluded because it's part of the text-search mechanic;
// re-running it alone usually isn't more illuminating than the spec summary.
function probeableFilters(spec: SearchSpec): Array<{
  entity: SearchEntityType;
  propertyName: string;
  operator: string;
  value: string;
}> {
  const out: Array<{
    entity: SearchEntityType;
    propertyName: string;
    operator: string;
    value: string;
  }> = [];
  for (const t of spec.targets) {
    for (const f of t.filters) {
      if (!PROBE_OPERATORS.has(f.operator)) continue;
      out.push({
        entity: t.entityType,
        propertyName: f.propertyName,
        operator: f.operator,
        value: f.value,
      });
    }
  }
  return out;
}

export async function buildDiagnostic(
  spec: SearchSpec,
  probe: FilterProbe,
): Promise<SearchDiagnostic> {
  const specSummary = humaniseSpec(spec);
  const filters = probeableFilters(spec);

  // No filters → nothing to probe; specSummary is the whole story.
  if (filters.length === 0) {
    return { specSummary };
  }

  // Single filter → probing it would just reconfirm what the user already
  // sees. Skip the per-filter table; still attempt didYouMean below.
  let filterProbes: SearchDiagnostic["filterProbes"];
  if (filters.length >= 2) {
    const counts = await Promise.all(
      filters.map((f) => probe(f.entity, f.propertyName, f.operator, f.value)),
    );
    filterProbes = filters.map((f, i) => ({
      label: humaniseFilter(f.propertyName, f.operator, f.value),
      propertyName: f.propertyName,
      value: f.value,
      aloneMatched: counts[i],
    }));
  }

  // Did-you-mean: any EQ/IN filter on a KNOWN_VALUES property whose alone-count
  // is 0 (or single-filter case where we know it returned 0 by virtue of the
  // overall blank).
  const didYouMean: NonNullable<SearchDiagnostic["didYouMean"]> = [];
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    if (f.operator !== "EQ" && f.operator !== "IN") continue;
    const candidates = KNOWN_VALUES[f.propertyName];
    if (!candidates) continue;
    const aloneCount = filterProbes ? filterProbes[i].aloneMatched : 0;
    if (aloneCount > 0) continue; // value matches HubSpot — no suggestion needed
    if (candidates.includes(f.value)) continue; // valid value but truly empty
    didYouMean.push({
      propertyName: f.propertyName,
      submitted: f.value,
      suggestions: closestMatch(f.value, candidates, 5, f.propertyName),
    });
  }

  return {
    specSummary,
    filterProbes,
    didYouMean: didYouMean.length > 0 ? didYouMean : undefined,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/__tests__/lib/search-diagnostics.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Pause for commit (deferred)**

```bash
git add src/lib/search-diagnostics.ts src/__tests__/lib/search-diagnostics.test.ts
```

---

## Task 4: Update `search-llm.ts` prompt to use `hubspot-enums.ts`

**Files:**
- Modify: `src/lib/search-llm.ts` (lines 118-127, 141-175)
- Test: `src/__tests__/lib/search-llm-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/lib/search-llm-prompt.test.ts
import { describe, it, expect } from "vitest";
import { _buildPromptForTest as buildPrompt } from "@/lib/search-llm";

describe("buildPrompt (Lookup)", () => {
  const filter = { kind: "all" } as const;

  it("includes the country ISO-code rule and table", () => {
    const p = buildPrompt("anything", filter, null);
    expect(p).toMatch(/two-letter ISO code/);
    expect(p).toMatch(/DK→Denmark/);
    expect(p).toMatch(/SE→Sweden/);
  });

  it("includes Unwilling for pay status", () => {
    const p = buildPrompt("anything", filter, null);
    expect(p).toContain("Unwilling");
  });

  it("Example 2 emits ISO code, not country name", () => {
    const p = buildPrompt("anything", filter, null);
    expect(p).toMatch(/Companies in DK with health score below 50/);
    expect(p).toMatch(/"value":"DK"/);
    expect(p).not.toMatch(/"value":"Denmark"/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/lib/search-llm-prompt.test.ts`
Expected: FAIL on `_buildPromptForTest` not exported (and on the country-rule assertions).

- [ ] **Step 3: Modify `src/lib/search-llm.ts`**

Replace the `ENUM_VALUES_BLOCK` constant (currently lines ~121-127) with a generated block. Add an import at the top:

```ts
import { KNOWN_VALUES, COUNTRY_CODES } from "./hubspot-enums";
```

Replace `ENUM_VALUES_BLOCK` with:

```ts
function enumValuesBlock(): string {
  const lines = Object.entries(KNOWN_VALUES)
    .filter(([prop]) => prop !== "understory_company_country")
    .map(([prop, vals]) => `  ${prop}: ${vals.map((v) => `"${v}"`).join(" | ")}`);
  return [
    "Enum values (use EXACTLY these strings, never reformat):",
    ...lines,
  ].join("\n");
}

function countryBlock(): string {
  const table = Object.entries(COUNTRY_CODES)
    .map(([code, name]) => `${code}→${name}`)
    .join(", ");
  return [
    "understory_company_country is stored as a two-letter ISO code, NOT a country name.",
    `Stored values are exactly: ${Object.keys(COUNTRY_CODES).join(", ")}.`,
    `When the user writes a country name or alternate form, look it up in this table and emit the ISO code (left side):`,
    `  ${table}`,
    `Output the ISO code (e.g. "DK"), never the friendly name (e.g. "Denmark").`,
  ].join("\n");
}
```

Update Example 2 in `EXAMPLES`:

```ts
// Example 2 (no text search — country is an ISO code, not a name)
// Query: "Companies in DK with health score below 50"
// Active filter: all
// Output:
// {"targets":[{"entityType":"company","filters":[{"propertyName":"understory_company_country","operator":"EQ","value":"DK"},{"propertyName":"health_score","operator":"LT","value":"50"}],"textSearch":null}],"ownerScope":{"kind":"all"},"limit":100}
```

(Keep the surrounding examples as-is.)

In `buildPrompt`, replace the line `${ENUM_VALUES_BLOCK}` with:

```ts
${countryBlock()}

${enumValuesBlock()}
```

At the bottom of the file, export an internal handle for the prompt-shape test:

```ts
// Test-only export: the internal prompt builder. Never call from app code.
export const _buildPromptForTest = buildPrompt;
```

- [ ] **Step 4: Run all related tests**

Run: `npx vitest run src/__tests__/lib/search-llm-prompt.test.ts src/__tests__/lib/hubspot-enums.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Pause for commit (deferred)**

```bash
git add src/lib/search-llm.ts src/__tests__/lib/search-llm-prompt.test.ts
```

---

## Task 5: Wire `buildDiagnostic` into `search.ts`

**Files:**
- Modify: `src/lib/search.ts`

- [ ] **Step 1: Add a single-filter probe helper at the bottom of the file**

```ts
// Probe helper used by search-diagnostics. Re-runs `executeTarget` with a
// minimal one-filter spec and returns the match count. Failures are coerced
// to 0 — the diagnostic is best-effort.
async function probeSingleFilter(
  entity: SearchEntityType,
  propertyName: string,
  operator: string,
  value: string,
): Promise<number> {
  try {
    const target: SearchTarget = {
      entityType: entity,
      filters: [{ propertyName, operator: operator as SearchTarget["filters"][number]["operator"], value }],
      textSearch: null,
    };
    const { results } = await executeTarget(target);
    return results.length;
  } catch {
    return 0;
  }
}
```

- [ ] **Step 2: Add an import + extend the SearchOutcome interface**

Top of file, add:

```ts
import { buildDiagnostic } from "./search-diagnostics";
import type { SearchDiagnostic } from "./types";
```

Update `SearchOutcome`:

```ts
export interface SearchOutcome {
  results: SearchResult[];
  parsed: SearchSpec | null;
  error?: string;
  diagnostic?: SearchDiagnostic;
}
```

- [ ] **Step 3: Always compute the spec summary; run blank-path diagnostics when results are empty**

In `searchDashboard`, after the result-assembly block (right before the final `return { results: combined, parsed: spec }`), insert:

```ts
  const diagnostic =
    combined.length === 0 && spec.targets.length > 0
      ? await buildDiagnostic(spec, probeSingleFilter)
      : { specSummary: humaniseSpecPlain(spec) };

  return { results: combined, parsed: spec, diagnostic };
```

And add the same `humaniseSpec` import at the top:

```ts
import { humaniseSpec as humaniseSpecPlain } from "./search-diagnostics";
```

(The alias keeps the local name unambiguous if `humaniseSpec` is ever introduced inside `search.ts`.)

- [ ] **Step 4: Wire the diagnostic into the SearchOutcome → SearchResponse boundary**

`buildSearchPayload` already returns `outcome.results / parsed / latencyMs / error` — extend it in `src/lib/search-payload.ts`:

```ts
return {
  results: outcome.results,
  parsed: outcome.parsed,
  latencyMs,
  error: outcome.error,
  diagnostic: outcome.diagnostic,
};
```

- [ ] **Step 5: Run typecheck + all tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; existing tests still pass; new tests pass.

- [ ] **Step 6: Pause for commit (deferred)**

```bash
git add src/lib/search.ts src/lib/search-payload.ts src/lib/types.ts
```

---

## Task 6: Bump cache version in `search-payload.ts`

**Files:**
- Modify: `src/lib/search-payload.ts`

- [ ] **Step 1: Add a `CACHE_VERSION` constant and fold it into the cache key**

At the top of the file:

```ts
// Bump this any time the prompt or response shape changes meaningfully.
// Folded into the cache key so a deploy invalidates pre-change cached
// responses (otherwise stale blanks could persist for up to 14 minutes).
const CACHE_VERSION = 2;
```

Update `buildSearchCacheKey`:

```ts
export function buildSearchCacheKey(
  query: string,
  filter: GlobalFilter,
  priorSpec: SearchSpec | null
): string {
  return `v${CACHE_VERSION}|q=${normaliseQuery(query)}|f=${filterScopeKey(filter)}|p=${priorSpecKey(priorSpec)}`;
}
```

- [ ] **Step 2: Verify build still passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Pause for commit (deferred)**

(Will be batched with Task 5's commit since both touch `search-payload.ts`.)

---

## Task 7: Render `specSummary` + diagnostic panel in `SearchView.tsx`

**Files:**
- Modify: `src/components/design/views/SearchView.tsx`
- Modify: `src/components/design/views/SearchContainer.tsx` (pass `diagnostic` through)

- [ ] **Step 1: Pass the diagnostic through `SearchContainer.tsx`**

Inside `SearchContainer`, add a state slot:

```ts
const [latestDiagnostic, setLatestDiagnostic] = useState<SearchResponse["diagnostic"]>(undefined);
```

In the success branch of `onSubmit`, after `setLatestResults(json.results)`:

```ts
setLatestDiagnostic(json.diagnostic);
```

In the rewind handler, restore the diagnostic from the chain turn (also extend `SearchTurn` if needed — see step 2). On reset:

```ts
setLatestDiagnostic(undefined);
```

Pass to `SearchView`:

```tsx
<SearchView
  …
  diagnostic={latestDiagnostic}
/>
```

- [ ] **Step 2: Extend `SearchTurn` to carry the diagnostic**

In `src/lib/types.ts`:

```ts
export interface SearchTurn {
  query: string;
  spec: SearchSpec | null;
  results: SearchResult[];
  diagnostic?: SearchDiagnostic;
}
```

Update the turn-creation in `SearchContainer`:

```ts
const turn: SearchTurn = {
  query: q,
  spec: json.parsed,
  results: json.results,
  diagnostic: json.diagnostic,
};
```

In `onRewindTo`:

```ts
setLatestDiagnostic(lastTurn?.diagnostic);
```

- [ ] **Step 3: Add a `diagnostic` prop and render block to `SearchView.tsx`**

Add the prop to `SearchViewProps`:

```ts
diagnostic?: SearchDiagnostic;
```

Render the always-on summary below the input (just above the results / empty-state region):

```tsx
{!loading && !error && diagnostic?.specSummary && (
  <div
    style={{
      marginTop: 14,
      fontFamily: "var(--font-editorial)",
      fontStyle: "italic",
      fontSize: 12.5,
      color: "var(--green-100)",
      lineHeight: 1.5,
    }}
  >
    {diagnostic.specSummary}
  </div>
)}
```

Replace the existing empty-after-search block (currently the centred "No matches…" panel) with a structured diagnostic panel:

```tsx
{!loading && !error && hasChain && results.length === 0 && (
  <div
    style={{
      marginTop: 22,
      padding: "22px 24px",
      background: "var(--light-grey)",
      border: "1px dashed var(--beige-gray)",
      borderRadius: 16,
      color: "var(--moss)",
      fontSize: 13,
      lineHeight: 1.55,
    }}
  >
    <div style={{ fontWeight: 600, marginBottom: 8 }}>No matches.</div>

    {diagnostic?.specSummary && (
      <div style={{ color: "var(--green-100)", fontStyle: "italic", marginBottom: 14 }}>
        {diagnostic.specSummary}
      </div>
    )}

    {diagnostic?.filterProbes && diagnostic.filterProbes.length > 0 && (
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            textTransform: "uppercase",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "var(--green-100)",
            marginBottom: 6,
          }}
        >
          What we tried
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {diagnostic.filterProbes.map((p, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                fontFamily: "var(--font-mono, ui-monospace)",
                fontSize: 12,
              }}
            >
              <span>{p.label}</span>
              <span style={{ color: p.aloneMatched === 0 ? "var(--rust)" : "var(--moss)" }}>
                {p.aloneMatched} {p.aloneMatched === 1 ? "match" : "matches"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {diagnostic?.didYouMean && diagnostic.didYouMean.length > 0 && (
      <div>
        {diagnostic.didYouMean.map((d, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <span style={{ color: "var(--green-100)" }}>
              &ldquo;{d.submitted}&rdquo; isn&rsquo;t a stored value for {d.propertyName}.
            </span>{" "}
            <span>Try: {d.suggestions.join(", ")}.</span>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

Import `SearchDiagnostic`:

```ts
import type { SearchDiagnostic, SearchResult, SearchTurn } from "@/lib/types";
```

- [ ] **Step 4: Verify lint + build**

Run: `npm run lint && npm run build`
Expected: no errors. Build covers typecheck.

- [ ] **Step 5: Pause for commit (deferred)**

```bash
git add src/components/design/views/SearchView.tsx src/components/design/views/SearchContainer.tsx src/lib/types.ts
```

---

## Task 8: Manual verification on localhost

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Wait for: `Ready on http://localhost:3000`.

- [ ] **Step 2: Smoke-test the example chip**

In the browser, open the Lookup view, click the chip "Companies in DK with health below 50".
Expected:
- ≥ 1 result row.
- Italic line above results: `Searched companies where country = Denmark (DK) and health_score < 50.`

- [ ] **Step 3: Smoke-test the unmatched-country path**

Type `Companies in Spain` and submit.
Expected:
- Empty-state panel shows.
- `What we tried` section absent (single filter).
- `Did you mean` shows: `Try: DK, SE, NO, DE, GB.` (or similar — top-5 by edit distance).

- [ ] **Step 4: Smoke-test the multi-filter blank path**

Type `Companies in Spain with health below 50` and submit.
Expected:
- Empty-state panel shows.
- `What we tried` lists both filters with per-filter counts.
- `Did you mean` surfaces country alternatives.

- [ ] **Step 5: Smoke-test pay-status enum**

Type `Pay-unwilling deals` and submit.
Expected:
- ≥ 1 result row.
- Summary mentions `Unwilling`.

- [ ] **Step 6: Smoke-test refinement chain**

Type `Companies in DK`, then refine with `narrow to last week`.
Expected: summary describes the merged spec; if blank, diagnostic explains.

- [ ] **Step 7: Report results to Filip**

If all four checks pass, summarise and ask whether to batch the deferred commits.
If any fails, capture the spec emitted (`parsed` field on the response) and the diagnostic, then return to the failing task.

---

## Self-review

**Spec coverage:**
- Goal 1 (DK chip works) → Task 4 (prompt fix) + Task 8 step 2.
- Goal 2 (drift becomes visible) → Tasks 3 + 7 (diagnostic + UI).
- Goal 3 (every search shows what was queried) → Task 7 (always-on `specSummary`).
- Edge cases 1-7 → covered in Tasks 3 (single-filter probe skip, text-search-only, multi-target combined zero), 6 (cache version), and 5 (edge runtime; `executeTarget` already edge-safe).
- Testing → Tasks 1, 3, 4 (unit tests); Task 8 (manual).

**Placeholder scan:** none.

**Type consistency:** `SearchDiagnostic` defined in Task 2, consumed in Tasks 3 / 5 / 7. `SearchTurn.diagnostic` added in Task 7 step 2. `FilterProbe` only used internally in `search-diagnostics.ts`.

**Open assumptions:**
- `executeTarget` is currently a non-exported function inside `search.ts`. Task 5's `probeSingleFilter` reuses it directly because we're inside the same file. No export change needed.
- `humaniseSpec` and `buildDiagnostic` both live in `search-diagnostics.ts`. `search.ts` imports both. The diagnostic path always calls `buildDiagnostic`; the happy path calls `humaniseSpec` directly to avoid the unnecessary work of the probe layer.
