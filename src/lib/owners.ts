// Owner and region constants used across the dashboard.
// Region groupings mirror the historical "SE+/DK+" filter logic but display as clean DK/SE/IT.

export interface Owner {
  id: string;
  name: string;
  /** Home region. Absent for territory owners, whose book spans several. */
  region?: RegionKey;
  color: string;
  // Optional override for the avatar initial. Defaults to name[0].
  // Used to disambiguate owners who share a first letter (e.g. Anders vs Alessandro).
  initial?: string;
  /**
   * Company-country ISO-2 codes this owner covers. When set, the owner's book
   * is a TERRITORY: every account in these countries, whoever owns it in
   * HubSpot. That has to be filtered client-side on the company country,
   * because the bulk routes scope by owner id and a territory owner owns none
   * of the accounts they cover.
   */
  countries?: readonly string[];
}

export type RegionKey = "DK" | "SE" | "IT" | "ES";

export type GlobalFilter =
  | { kind: "all" }
  | { kind: "region"; region: RegionKey }
  | { kind: "person"; ownerId: string };

export const ALL_FILTER: GlobalFilter = { kind: "all" };

export const OWNERS: Owner[] = [
  { id: "34100335", name: "Alessandro", region: "IT", color: "#FFE0B5", initial: "Al" },
  { id: "962517007", name: "Anders", region: "DK", color: "#D1BEE7", initial: "An" },
  { id: "559364799", name: "Cecilia", region: "SE", color: "#CFE8FF" },
  { id: "1939229547", name: "Filip", region: "SE", color: "#D5DFCA" },
  // Nordic coverage, started 2026-08-26. No home region and no owned deals:
  // her book is the territory below, which deliberately overlaps the Danish
  // and Swedish owners'. GL and FO are in it because they sit in the book and
  // belong to no one else's patch.
  {
    id: "37173812",
    name: "Janne",
    color: "#BEE3D9",
    countries: ["DK", "SE", "NO", "FI", "GL", "FO"],
  },
  { id: "44912650", name: "Marc", region: "DK", color: "#F1F97E" },
  { id: "34100332", name: "Nicoletta", region: "IT", color: "#E8D5F0" },
  { id: "90324081", name: "Vlad", region: "IT", color: "#F4C4A0" },
];

export const OWNER_MAP: Record<string, Owner> = Object.fromEntries(
  OWNERS.map((o) => [o.id, o])
);

/**
 * A region normally resolves to the CS owners who sit in it. Spain has no CS
 * owner yet, so it declares `countries` and resolves by company country
 * instead - the only definition that returns anything. Note this makes Spain
 * mean "accounts in Spain" while DK/SE/IT still mean "accounts owned by that
 * region's reps"; the two differ by ~60 accounts each (reps hold accounts
 * outside their own country). Worth unifying, but that would move a couple of
 * hundred accounts between filters, so it is a deliberate decision, not a
 * detail to change in passing.
 */
export const REGIONS: { key: RegionKey; label: string; countries?: readonly string[] }[] = [
  { key: "DK", label: "Denmark" },
  { key: "SE", label: "Sweden" },
  { key: "IT", label: "Italy" },
  // Spanish CS reps are being hired later this year. When they land, give them
  // region: "ES" and delete `countries` here to put Spain on the same
  // owner-based footing as its siblings - it is deliberately explicit rather
  // than "owners if any, else countries", so the switch is a visible decision
  // and not a silent change the first time someone is added.
  { key: "ES", label: "Spain", countries: ["ES"] },
];

// Map a global filter to the set of owner IDs that should pass.
// Returns null when no owner-id-based filtering should apply (i.e. "All").
export function effectiveOwnerIds(filter: GlobalFilter): Set<string> | null {
  if (filter.kind === "all") return null;
  if (filter.kind === "person") {
    // A territory owner has no owner scope to send - the accounts are owned by
    // other people. Fetch the whole book and let effectiveCountries narrow it.
    if (OWNER_MAP[filter.ownerId]?.countries) return null;
    return new Set([filter.ownerId]);
  }
  // A country-scoped region has no owners to scope by; fetch the whole book
  // and let effectiveCountries narrow it, exactly as for a territory owner.
  // Without this the empty owner set would serialise to "", which the API
  // reads as "no filter" and answers with the entire book.
  if (REGIONS.find((r) => r.key === filter.region)?.countries) return null;
  const ids = OWNERS.filter((o) => o.region === filter.region).map((o) => o.id);
  return new Set(ids);
}

/**
 * ISO-2 company countries the filter narrows to, or null when it does not
 * narrow by country. Applied client-side by the dashboard containers.
 */
export function effectiveCountries(filter: GlobalFilter): Set<string> | null {
  if (filter.kind === "region") {
    const countries = REGIONS.find((r) => r.key === filter.region)?.countries;
    return countries ? new Set(countries) : null;
  }
  if (filter.kind !== "person") return null;
  const countries = OWNER_MAP[filter.ownerId]?.countries;
  return countries ? new Set(countries) : null;
}

/**
 * Whether the current scope can hold accounts owned by different people. False
 * only for a normal person filter, where every row would show the same avatar
 * and the OWNER column is dead weight. A territory owner's rows have many
 * different owners, so the column earns its place.
 */
export function scopeHasMixedOwners(filter: GlobalFilter): boolean {
  if (filter.kind !== "person") return true;
  return Boolean(OWNER_MAP[filter.ownerId]?.countries);
}

// Human-readable label for the active filter (shown in headers so a sticky
// filter never silently hides results). Returns null when filter is "All".
export function filterLabel(filter: GlobalFilter): string | null {
  if (filter.kind === "all") return null;
  if (filter.kind === "person") {
    const o = OWNER_MAP[filter.ownerId];
    return o ? `viewing: ${o.name}` : null;
  }
  const r = REGIONS.find((x) => x.key === filter.region);
  return r ? `viewing: ${r.label}` : null;
}

// Serialize / parse a filter for localStorage. Returns null if the input
// is missing or doesn't match a known shape (covers schema drift gracefully).
export function serializeFilter(f: GlobalFilter): string {
  return JSON.stringify(f);
}

export function parseFilter(raw: string | null): GlobalFilter | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v?.kind === "all") return { kind: "all" };
    if (
      v?.kind === "region" &&
      REGIONS.some((r) => r.key === v.region)
    ) {
      return { kind: "region", region: v.region };
    }
    if (v?.kind === "person" && typeof v.ownerId === "string" && OWNER_MAP[v.ownerId]) {
      return { kind: "person", ownerId: v.ownerId };
    }
  } catch {
    /* fall through */
  }
  return null;
}
