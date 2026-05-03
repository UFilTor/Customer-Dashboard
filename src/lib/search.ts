import { HUBSPOT_API, hubspotHeaders } from "./hubspot-api";
import { searchObjectsPage } from "./hubspot-search";
import { parseQuery } from "./search-llm";
import { buildDiagnostic, humaniseSpec } from "./search-diagnostics";
import {
  hubspotCompanyUrl,
  hubspotDealUrl,
  hubspotEngagementUrl,
} from "./hubspot-links";
import type { GlobalFilter } from "./owners";
import type {
  SearchDiagnostic,
  SearchEntityType,
  SearchFilter,
  SearchOperator,
  SearchResult,
  SearchSnippet,
  SearchSpec,
  SearchTarget,
} from "./types";

// Multi-target search orchestration. Owns the contract: NL query → validated
// SearchSpec → HubSpot filterGroups → results dedupe + scoring → SearchResult[].
//
// The LLM (search-llm.ts) is treated as an untrusted source: every spec it
// emits is re-validated here against per-entity allowlists before any HubSpot
// call. A field outside the allowlist becomes an error, never a query.

// Per-entity allowlists. These are duplicated from search-llm.ts on purpose
// so the validator doesn't depend on the prompt's text staying in sync — if
// they drift, validation simply rejects the new field.
const ENTITY_FIELDS: Record<SearchEntityType, Set<string>> = {
  deal: new Set([
    "dealname",
    "dealstage",
    "pipeline",
    "hubspot_owner_id",
    "createdate",
    "amount",
    "amount_in_home_currency",
    "deal_currency_code",
    "confirmed__contract_mrr",
    "confirmed_booking_fee",
    "booking_fee",
    "test_billing_start_date",
    "understory_pay_status__customer",
    "customer_stage",
    "customer_substage",
    "wish_to_churn",
    "churn_reason",
    "churned_reason_elaborated",
    "churn_date",
    "ob_note___customer_needs_",
    "ob_note___promises_made",
    "ob_note___grow_notes__if_booked_",
    "ob_note___link_to_experience_s__that_need_to_be_created_",
    "hibernation_notes",
    "product_hold_note",
    "hs_next_step",
  ]),
  company: new Set([
    "name",
    "domain",
    "hubspot_owner_id",
    "createdate",
    "understory_company_country",
    "health_score",
    "understory_pay_status__customer",
    "subscription_plan",
    "notes_last_contacted",
    "understory_latest_event",
    "understory_booking_volume_12m",
    "understory_booking_volume_3m",
    "understory_booking_volume_6m",
    "understory_total_number_of_transactions",
  ]),
  note: new Set(["hs_note_body", "hs_timestamp", "hubspot_owner_id"]),
  meeting: new Set([
    "hs_meeting_title",
    "hs_meeting_body",
    "hs_internal_meeting_notes",
    "hs_meeting_outcome",
    "hs_meeting_start_time",
    "hs_meeting_end_time",
    "hubspot_owner_id",
  ]),
  call: new Set([
    "hs_call_body",
    "hs_call_title",
    "hs_call_disposition",
    "hs_timestamp",
    "hubspot_owner_id",
  ]),
  email: new Set([
    "hs_email_subject",
    "hs_email_text",
    "hs_email_direction",
    "hs_timestamp",
    "hubspot_owner_id",
  ]),
};

const VALID_OPERATORS = new Set([
  "EQ",
  "NEQ",
  "GT",
  "LT",
  "GTE",
  "LTE",
  "CONTAINS_TOKEN",
  "IN",
  "NOT_IN",
  "HAS_PROPERTY",
  "BETWEEN",
]);

// HubSpot's object endpoint is the entity name pluralised — e.g. "deals" /
// "companies" / "notes". Map the spec's entityType to the API segment.
const HUBSPOT_OBJECT_PATH: Record<SearchEntityType, string> = {
  deal: "deals",
  company: "companies",
  note: "notes",
  meeting: "meetings",
  call: "calls",
  email: "emails",
};

// Properties we actually want returned by the search call, per entity. Keep
// these small — search results are bulk and a wide property fan-out doubles
// payload size.
const SEARCH_RETURN_PROPS: Record<SearchEntityType, string[]> = {
  deal: ["dealname", "dealstage", "hubspot_owner_id", "createdate"],
  company: ["name", "domain", "hubspot_owner_id", "health_score"],
  note: ["hs_note_body", "hs_timestamp", "hubspot_owner_id"],
  meeting: [
    "hs_meeting_title",
    "hs_meeting_body",
    "hs_meeting_start_time",
    "hubspot_owner_id",
  ],
  call: ["hs_call_title", "hs_call_body", "hs_timestamp", "hubspot_owner_id"],
  email: ["hs_email_subject", "hs_email_text", "hs_timestamp", "hubspot_owner_id"],
};

// Sort by the most-relevant timestamp per entity so search-API pagination is
// stable (HubSpot pagination silently truncates without `sorts`).
const SORT_PROPERTY: Record<SearchEntityType, string> = {
  deal: "createdate",
  company: "createdate",
  note: "hs_timestamp",
  meeting: "hs_meeting_start_time",
  call: "hs_timestamp",
  email: "hs_timestamp",
};

// Validate a single target. Returns an error message on first invariant
// violation, null when the target is acceptable.
function validateTarget(t: SearchTarget): string | null {
  const fields = ENTITY_FIELDS[t.entityType];
  if (!fields) return `Unknown entityType: ${t.entityType}`;
  for (const f of t.filters) {
    if (!fields.has(f.propertyName)) {
      return `Unknown property "${f.propertyName}" on ${t.entityType}.`;
    }
    if (!VALID_OPERATORS.has(f.operator)) {
      return `Unknown operator "${f.operator}".`;
    }
  }
  if (t.textSearch) {
    if (!Array.isArray(t.textSearch.terms) || t.textSearch.terms.length === 0) {
      return "textSearch must have at least one term.";
    }
    if (t.textSearch.terms.some((term) => !term || typeof term !== "string")) {
      return "textSearch terms must be non-empty strings.";
    }
    for (const fieldName of t.textSearch.fields) {
      if (!fields.has(fieldName)) {
        return `Unknown text-search field "${fieldName}" on ${t.entityType}.`;
      }
    }
  }
  return null;
}

function validateSpec(spec: SearchSpec): string | null {
  if (!spec || !Array.isArray(spec.targets)) return "Spec is missing targets.";
  if (spec.targets.length === 0) return null; // Empty is allowed (LLM bailed).
  for (const t of spec.targets) {
    const err = validateTarget(t);
    if (err) return err;
  }
  return null;
}

// HubSpot filterGroups are OR-combined groups of AND-combined filters. A
// text-search becomes the cartesian product of `terms` × `fields`: each
// (term, field) pair becomes its own filterGroup that AND-combines the base
// filters with one CONTAINS_TOKEN clause. HubSpot caps `filterGroups` at 5
// per request, so we slice the pairs into chunks of 5 and let executeTarget
// run multiple searches in parallel — results merged + deduped by id below.
const FILTER_GROUP_LIMIT = 5;

function buildFilterGroupChunks(t: SearchTarget): Record<string, unknown>[][] {
  const baseFilters = t.filters.map((f) => filterToHubspot(f));
  if (!t.textSearch) {
    return baseFilters.length > 0 ? [[{ filters: baseFilters }]] : [];
  }
  const { terms, fields } = t.textSearch;
  const pairs: Array<{ field: string; term: string }> = [];
  // Field-outer, term-inner: with 7 fields × 2 terms the order is
  // (f1,t1), (f1,t2), (f2,t1), … — multi-synonym queries get early-field
  // coverage on both terms before any field doubles up.
  for (let fi = 0; fi < fields.length; fi++) {
    for (let ti = 0; ti < terms.length; ti++) {
      pairs.push({ field: fields[fi], term: terms[ti] });
    }
  }
  const allGroups = pairs.map(({ field, term }) => ({
    filters: [
      ...baseFilters,
      { propertyName: field, operator: "CONTAINS_TOKEN", value: term },
    ],
  }));
  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < allGroups.length; i += FILTER_GROUP_LIMIT) {
    chunks.push(allGroups.slice(i, i + FILTER_GROUP_LIMIT));
  }
  return chunks;
}

function filterToHubspot(f: SearchFilter): Record<string, unknown> {
  // BETWEEN takes "value" + "highValue"; IN/NOT_IN take "values" array.
  if (f.operator === "BETWEEN") {
    return {
      propertyName: f.propertyName,
      operator: "BETWEEN",
      value: f.value,
      highValue: f.highValue ?? "",
    };
  }
  if (f.operator === "IN" || f.operator === "NOT_IN") {
    return {
      propertyName: f.propertyName,
      operator: f.operator,
      values: f.value.split(",").map((s) => s.trim()).filter(Boolean),
    };
  }
  return {
    propertyName: f.propertyName,
    operator: f.operator,
    value: f.value,
  };
}

// Per-target search. Chunked because HubSpot caps `filterGroups` at 5 per
// request; for a deal text-search across 7 OB-note-ish fields with 2
// synonyms (14 pairs), we run 3 parallel HubSpot searches and merge their
// results, deduped by id. We don't paginate beyond the first 100 per chunk —
// UX-wise the user is going to refine instead of scroll past 100.
async function executeTarget(t: SearchTarget): Promise<{
  entityType: SearchEntityType;
  results: Array<{ id: string; properties: Record<string, string> }>;
}> {
  const chunks = buildFilterGroupChunks(t);
  if (chunks.length === 0) {
    return { entityType: t.entityType, results: [] };
  }
  const path = HUBSPOT_OBJECT_PATH[t.entityType];
  const props = SEARCH_RETURN_PROPS[t.entityType];
  const sorts = [
    { propertyName: SORT_PROPERTY[t.entityType], direction: "DESCENDING" },
  ];
  const pages = await Promise.all(
    chunks.map(async (filterGroups) => {
      const body: Record<string, unknown> = {
        filterGroups,
        properties: props,
        sorts,
        limit: 100,
      };
      try {
        const { results } = await searchObjectsPage<{
          id: string;
          properties: Record<string, string>;
        }>(path, body);
        return results;
      } catch (err) {
        console.error(
          `[search] target ${t.entityType} chunk failed:`,
          err instanceof Error ? err.message : err
        );
        return [];
      }
    })
  );
  // Dedup by id across the chunk pages.
  const seen = new Set<string>();
  const merged: Array<{ id: string; properties: Record<string, string> }> = [];
  for (const page of pages) {
    for (const obj of page) {
      if (seen.has(obj.id)) continue;
      seen.add(obj.id);
      merged.push(obj);
    }
  }
  return { entityType: t.entityType, results: merged };
}

// Resolve a list of engagement IDs to their associated company IDs. Returns
// a Map<engagementId, companyId>; engagements with no company assoc are
// missing from the map (caller falls back to engagement-only display).
async function fetchEngagementCompanyMap(
  entity: "note" | "meeting" | "call" | "email",
  ids: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const path = HUBSPOT_OBJECT_PATH[entity];
  // Batch in slices of 50 to match the existing fetchAssociations pattern.
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
  await Promise.all(
    batches.map(async (batch) => {
      try {
        const res = await fetch(
          `${HUBSPOT_API}/crm/v4/associations/${path}/companies/batch/read`,
          {
            method: "POST",
            headers: hubspotHeaders(),
            body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
          }
        );
        if (!res.ok) return;
        const data = await res.json();
        for (const r of data.results || []) {
          const fromId = String(r.from?.id ?? "");
          const toId = r.to?.[0]?.toObjectId;
          if (fromId && toId) out.set(fromId, String(toId));
        }
      } catch {
        // Ignore — engagement-only result still surfaces, it just won't
        // resolve to a CompanyDetail click-through.
      }
    })
  );
  return out;
}

// Snippet extraction — find the first occurrence of any term (case-insensitive)
// in the body and return ~120 chars centred on it. Falls back to the body's
// leading 200 chars when no match found (defensive — should be rare given the
// search filtered for it, but HubSpot tokenisation can match where a substring
// search would not).
function makeSnippet(body: string | undefined, terms: string[]): string {
  if (!body) return "";
  const cleaned = body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (terms.length === 0) return cleaned.slice(0, 200);
  const lower = cleaned.toLowerCase();
  let bestIdx = -1;
  let bestTerm = "";
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (bestIdx < 0 || i < bestIdx)) {
      bestIdx = i;
      bestTerm = t;
    }
  }
  if (bestIdx < 0) return cleaned.slice(0, 200);
  const start = Math.max(0, bestIdx - 60);
  const end = Math.min(cleaned.length, bestIdx + bestTerm.length + 80);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < cleaned.length ? "…" : "";
  return prefix + cleaned.slice(start, end) + suffix;
}

function timestampMs(occurredAt: string): number {
  const t = Date.parse(occurredAt);
  return isNaN(t) ? 0 : t;
}

// Main entry: NL query → SearchResult[].
export interface SearchOutcome {
  results: SearchResult[];
  parsed: SearchSpec | null;
  error?: string;
  diagnostic?: SearchDiagnostic;
}

// Single-filter probe used by search-diagnostics.buildDiagnostic. Returns the
// match count for the filter alone; failures coerce to 0 — diagnostics are
// best-effort and shouldn't block the user-facing response.
async function probeSingleFilter(
  entity: SearchEntityType,
  propertyName: string,
  operator: string,
  value: string,
): Promise<number> {
  try {
    const target: SearchTarget = {
      entityType: entity,
      filters: [
        { propertyName, operator: operator as SearchOperator, value },
      ],
      textSearch: null,
    };
    const { results } = await executeTarget(target);
    return results.length;
  } catch {
    return 0;
  }
}

export async function searchDashboard(
  query: string,
  filter: GlobalFilter,
  priorSpec: SearchSpec | null = null
): Promise<SearchOutcome> {
  // 1. Quick-fail when the query references "mine" but the user hasn't picked
  //    a person filter — saves an LLM round-trip.
  const minePattern = /\b(mine|my|i'm|i am|me)\b/i;
  if (minePattern.test(query) && filter.kind === "all" && !priorSpec) {
    return {
      results: [],
      parsed: null,
      error: "Set the Filter pill to a person to use 'mine'.",
    };
  }

  // 2. LLM parse.
  const { spec, error: parseErr } = await parseQuery(query, filter, priorSpec);
  if (parseErr || !spec) {
    return { results: [], parsed: null, error: parseErr ?? "Couldn't parse the query." };
  }

  // 3. Validate.
  const validateErr = validateSpec(spec);
  if (validateErr) {
    return { results: [], parsed: spec, error: validateErr };
  }
  if (spec.targets.length === 0) {
    return { results: [], parsed: spec };
  }

  // 4. Execute every target in parallel.
  const targetResults = await Promise.all(
    spec.targets.map((t) => executeTarget(t))
  );

  // 5. For each engagement-target, batch-resolve to company. Run resolutions
  //    in parallel — they don't depend on each other.
  const engagementCompanyMaps: Partial<
    Record<"note" | "meeting" | "call" | "email", Map<string, string>>
  > = {};
  await Promise.all(
    (["note", "meeting", "call", "email"] as const).map(async (kind) => {
      const ids = targetResults
        .filter((tr) => tr.entityType === kind)
        .flatMap((tr) => tr.results.map((r) => r.id));
      if (ids.length === 0) return;
      engagementCompanyMaps[kind] = await fetchEngagementCompanyMap(kind, ids);
    })
  );

  // 6. Assemble SearchResults, dedupe by company (when resolvable).
  type Bucket = {
    id: string;
    type: SearchEntityType;
    title: string;
    subtitle: string;
    companyId: string | null;
    hubspotUrl: string;
    snippets: SearchSnippet[];
    score: number;
  };
  const byCompany = new Map<string, Bucket>();
  const orphans: Bucket[] = [];

  for (const tr of targetResults) {
    const terms =
      spec.targets.find((t) => t.entityType === tr.entityType)?.textSearch?.terms ?? [];
    for (const obj of tr.results) {
      const props = obj.properties || {};
      let companyId: string | null = null;
      let title = "";
      let subtitle = "";
      let hubspotUrl: string;
      let snippet: SearchSnippet | null = null;
      let occurredAt = "";

      if (tr.entityType === "deal") {
        title = props.dealname || "(Untitled deal)";
        subtitle = props.dealstage ? `Stage ${props.dealstage}` : "Deal";
        hubspotUrl = hubspotDealUrl(obj.id) ?? "#";
        occurredAt = props.createdate ?? "";
        // Deals can be associated with companies. Defer to a single bulk
        // resolve below — for v1 we simply leave companyId null and link to
        // the deal record itself.
      } else if (tr.entityType === "company") {
        title = props.name || "(Unknown company)";
        subtitle = props.domain ? props.domain : "Company";
        companyId = obj.id;
        hubspotUrl = hubspotCompanyUrl(obj.id) ?? "#";
        occurredAt = props.createdate ?? "";
      } else {
        // Engagement.
        const kind = tr.entityType;
        const companyMap = engagementCompanyMaps[kind];
        companyId = companyMap?.get(obj.id) ?? null;
        if (kind === "meeting") {
          title = props.hs_meeting_title || "(Untitled meeting)";
          occurredAt = props.hs_meeting_start_time ?? "";
          snippet = {
            engagementType: "meeting",
            occurredAt,
            excerpt: makeSnippet(props.hs_meeting_body, terms),
            hubspotUrl: hubspotEngagementUrl("meeting", obj.id) ?? "#",
          };
        } else if (kind === "call") {
          title = props.hs_call_title || "(Call)";
          occurredAt = props.hs_timestamp ?? "";
          snippet = {
            engagementType: "call",
            occurredAt,
            excerpt: makeSnippet(props.hs_call_body, terms),
            hubspotUrl: hubspotEngagementUrl("call", obj.id) ?? "#",
          };
        } else if (kind === "email") {
          title = props.hs_email_subject || "(Email)";
          occurredAt = props.hs_timestamp ?? "";
          snippet = {
            engagementType: "email",
            occurredAt,
            excerpt: makeSnippet(props.hs_email_text, terms),
            hubspotUrl: hubspotEngagementUrl("email", obj.id) ?? "#",
          };
        } else {
          title = "(Note)";
          occurredAt = props.hs_timestamp ?? "";
          snippet = {
            engagementType: "note",
            occurredAt,
            excerpt: makeSnippet(props.hs_note_body, terms),
            hubspotUrl: hubspotEngagementUrl("note", obj.id) ?? "#",
          };
        }
        subtitle = `${kind[0].toUpperCase() + kind.slice(1)} · ${occurredAt.slice(0, 10)}`;
        hubspotUrl =
          (companyId ? hubspotCompanyUrl(companyId) : null) ??
          snippet?.hubspotUrl ??
          "#";
      }

      const score = timestampMs(occurredAt);
      const key = companyId ?? `${tr.entityType}:${obj.id}`;
      const existing = byCompany.get(key);
      if (existing) {
        existing.score = Math.max(existing.score, score);
        if (snippet && existing.snippets.length < 3) existing.snippets.push(snippet);
        continue;
      }
      const bucket: Bucket = {
        id: key,
        type: companyId ? "company" : tr.entityType,
        title,
        subtitle,
        companyId,
        hubspotUrl,
        snippets: snippet ? [snippet] : [],
        score,
      };
      if (companyId) byCompany.set(key, bucket);
      else orphans.push(bucket);
    }
  }

  // 7. Order: companies (with snippets) first by recency, then orphan
  //    engagement-only results.
  const companyResults = Array.from(byCompany.values()).sort(
    (a, b) => b.score - a.score
  );
  const orphanResults = orphans.sort((a, b) => b.score - a.score);
  const combined: SearchResult[] = [...companyResults, ...orphanResults].slice(
    0,
    spec.limit > 0 ? spec.limit : 100
  );

  // Diagnostics: always emit a spec summary so the view can show what was
  // searched. On the blank-result path we additionally probe each filter
  // alone and surface did-you-mean hints — see search-diagnostics.ts.
  const diagnostic: SearchDiagnostic =
    combined.length === 0 && spec.targets.length > 0
      ? await buildDiagnostic(spec, probeSingleFilter)
      : { specSummary: humaniseSpec(spec) };

  return { results: combined, parsed: spec, diagnostic };
}
