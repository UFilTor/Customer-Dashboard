// The bulk /api/meeting-prep payload only covers the seeded day window. Days
// outside it are loaded one at a time (/api/meeting-prep/day) and merged into
// the same meeting list. A bulk refetch (R, or the quiet refetch when the user
// comes back to Meeting Prep) replaces that list, so it must carry those days
// over, or a selected day that was loaded on demand turns into a false
// "No meetings on this day" while the day still counts as fetched.
// `lazyDays` is the set of on-demand days that are NOT in the bulk window.
// TODO(simplification): carried-over days keep their pre-refetch meetings, so
// R does not refresh them. Upgrade path: re-run the per-day fetch for each
// lazy day after a forced refresh.
export function carryOverLazyDays<T extends { meeting: { startsAt: string } }>(
  fresh: T[],
  previous: T[],
  lazyDays: ReadonlySet<string>,
  dayOf: (entry: T) => string,
): T[] {
  if (lazyDays.size === 0) return fresh;
  const kept = previous.filter((m) => lazyDays.has(dayOf(m)));
  if (kept.length === 0) return fresh;
  return [...fresh, ...kept].sort((a, b) =>
    a.meeting.startsAt.localeCompare(b.meeting.startsAt)
  );
}
