import type { Engagement } from "./types";

export interface ActivityFilterState {
  types: string[] | null; // null means all types
  daysBack: number;
}

function parseTimestamp(ts: string): number {
  const asInt = parseInt(ts);
  if (!isNaN(asInt) && String(asInt) === ts) return asInt;
  return new Date(ts).getTime();
}

export function filterEngagements(
  engagements: Engagement[],
  filters: ActivityFilterState
): Engagement[] {
  const cutoff = Date.now() - filters.daysBack * 86400000;

  return engagements.filter((e) => {
    if (filters.types && !filters.types.includes(e.type)) return false;
    const ts = parseTimestamp(e.timestamp);
    if (ts < cutoff) return false;
    return true;
  });
}
