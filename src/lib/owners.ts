// Owner and region constants used across the dashboard.
// Region groupings mirror the historical "SE+/DK+" filter logic but display as clean DK/SE/IT.

export interface Owner {
  id: string;
  name: string;
  region: RegionKey;
  color: string;
  // Optional override for the avatar initial. Defaults to name[0].
  // Used to disambiguate owners who share a first letter (e.g. Anders vs Alessandro).
  initial?: string;
}

export type RegionKey = "DK" | "SE" | "IT";

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
  { id: "44912650", name: "Marc", region: "DK", color: "#F1F97E" },
  { id: "34100332", name: "Nicoletta", region: "IT", color: "#E8D5F0" },
  { id: "90324081", name: "Vlad", region: "IT", color: "#F4C4A0" },
];

export const OWNER_MAP: Record<string, Owner> = Object.fromEntries(
  OWNERS.map((o) => [o.id, o])
);

export const REGIONS: { key: RegionKey; label: string }[] = [
  { key: "DK", label: "Denmark" },
  { key: "SE", label: "Sweden" },
  { key: "IT", label: "Italy" },
];

// Map a global filter to the set of owner IDs that should pass.
// Returns null when no owner-id-based filtering should apply (i.e. "All").
export function effectiveOwnerIds(filter: GlobalFilter): Set<string> | null {
  if (filter.kind === "all") return null;
  if (filter.kind === "person") return new Set([filter.ownerId]);
  const ids = OWNERS.filter((o) => o.region === filter.region).map((o) => o.id);
  return new Set(ids);
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
      (v.region === "DK" || v.region === "SE" || v.region === "IT")
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
