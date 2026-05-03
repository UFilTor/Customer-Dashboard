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
  SearchEntityType,
  SearchSpec,
  SearchTarget,
} from "./types";

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

function humaniseFilter(propertyName: string, operator: string, value: string): string {
  if (propertyName === "hubspot_owner_id" && operator === "EQ") {
    const owner = OWNER_MAP[value];
    return owner ? `owned by ${owner.name}` : `owner = ${value}`;
  }
  const verb = FILTER_VERB[operator] ?? operator;
  const shownValue = humaniseValue(propertyName, value);
  const shownProp =
    propertyName === "understory_company_country" ? "country" : propertyName;
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

  const ownerFilter = t.filters.find(
    (f) => f.propertyName === "hubspot_owner_id" && f.operator === "EQ",
  );
  const otherFilters = t.filters.filter((f) => f !== ownerFilter);

  if (ownerFilter) {
    parts.push(
      humaniseFilter(ownerFilter.propertyName, ownerFilter.operator, ownerFilter.value),
    );
  }

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
  "EQ",
  "NEQ",
  "GT",
  "LT",
  "GTE",
  "LTE",
  "IN",
  "NOT_IN",
  "BETWEEN",
  "HAS_PROPERTY",
]);

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

  if (filters.length === 0) {
    return { specSummary };
  }

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

  const didYouMean: NonNullable<SearchDiagnostic["didYouMean"]> = [];
  for (let i = 0; i < filters.length; i++) {
    const f = filters[i];
    if (f.operator !== "EQ" && f.operator !== "IN") continue;
    const candidates = KNOWN_VALUES[f.propertyName];
    if (!candidates) continue;
    const aloneCount = filterProbes ? filterProbes[i].aloneMatched : 0;
    if (aloneCount > 0) continue;
    if (candidates.includes(f.value)) continue;
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
