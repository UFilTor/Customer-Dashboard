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

/** Minimal shape `meetingMatchesFilter` needs — structural so tests can stub it. */
export interface FilterableMeetingEntry {
  meeting: {
    ownerId: string;
    /** Optional: pre-deploy cached payloads predate this field. */
    attendeeOwnerIds?: string[] | null;
  };
  /** Account location, for the country-scoped regions that have no owner yet. */
  deal: { country: string | null };
}

/**
 * Is any of `ids` actually in this meeting — as organizer or as attendee?
 *
 * Owning the account deliberately does NOT count. Meeting prep is a calendar:
 * a meeting a colleague runs on your account is not yours to prep, and putting
 * it on your day strip only crowds out the ones you have to walk into.
 */
function someoneIsInMeeting(ids: Set<string>, entry: FilterableMeetingEntry): boolean {
  if (entry.meeting.ownerId && ids.has(entry.meeting.ownerId)) return true;
  for (const id of entry.meeting.attendeeOwnerIds ?? []) {
    if (ids.has(id)) return true;
  }
  return false;
}

/**
 * Does this meeting belong in the filtered view?
 *
 * A person filter asks "is this person in the meeting?" — organizer or
 * attendee, never account owner. This is the deliberate split from Portfolio,
 * which scopes by who owns the account (and by country for a territory owner).
 * Both halves of that split matter:
 *
 *  - Testing the account owner would surface colleagues' meetings you cannot
 *    prep for, and, for a territory owner, would fill the day strip with every
 *    meeting anyone holds anywhere in the territory.
 *  - Testing ONLY the account owner — the bug this replaced — silently dropped
 *    meetings you organize or attend on a colleague's account.
 *
 * So don't reuse the Portfolio scoping helpers here; the two answer different
 * questions on purpose.
 *
 * A region defined by countries rather than owners (Spain, until its CS reps
 * are hired) has nobody to attend anything, so location is the only test that
 * returns results there.
 */
export function meetingMatchesFilter(
  filter: GlobalFilter,
  entry: FilterableMeetingEntry
): boolean {
  if (filter.kind === "person") {
    return someoneIsInMeeting(new Set([filter.ownerId]), entry);
  }
  const countries = effectiveCountries(filter);
  if (countries) {
    return entry.deal.country ? countries.has(entry.deal.country) : false;
  }
  const ids = effectiveOwnerIds(filter);
  if (!ids) return true;
  return someoneIsInMeeting(ids, entry);
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
