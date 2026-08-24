// Pure grouping + card-derivation logic for the Portfolio kanban board.
// No React, no fetch. Consumed by UI components in a later task.

import type { PortfolioRow, PortfolioStage } from "./types";

export type KanbanColumnKey =
  | "create_account"
  | "create_experience"
  | "awaiting_meeting"
  | "in_progress"
  | "adopted"
  | "started"
  | "ramp_up"
  | "established";

export type KanbanCardFieldMode = "early" | "experience" | "ongoing";

export interface KanbanColumnDef {
  key: KanbanColumnKey;
  label: string;
  dealstageId: string;
  fields: KanbanCardFieldMode;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  { key: "create_account", label: "Create account", dealstageId: "1571910876", fields: "early" },
  { key: "create_experience", label: "Create Experience", dealstageId: "1899766980", fields: "experience" },
  { key: "awaiting_meeting", label: "Awaiting meeting", dealstageId: "875045332", fields: "early" },
  { key: "in_progress", label: "In progress", dealstageId: "307938521", fields: "ongoing" },
  { key: "adopted", label: "Adopted", dealstageId: "307938522", fields: "ongoing" },
  { key: "started", label: "Started", dealstageId: "5691910345", fields: "ongoing" },
  { key: "ramp_up", label: "Ramp Up", dealstageId: "3460322544", fields: "ongoing" },
  { key: "established", label: "Established", dealstageId: "1486762226", fields: "ongoing" },
];

// dealstageId -> column key, built once from KANBAN_COLUMNS.
const DEALSTAGE_TO_COLUMN: Record<string, KanbanColumnKey> = Object.fromEntries(
  KANBAN_COLUMNS.map((col) => [col.dealstageId, col.key])
);

// Fallback used when dealstageId is null or unrecognized.
const STAGE_FALLBACK: Record<PortfolioStage, KanbanColumnKey> = {
  Onboarding: "create_account",
  Adopted: "adopted",
  Started: "started",
  "Ramp Up": "ramp_up",
  Established: "established",
};

const DEFAULT_COLUMN: KanbanColumnKey = "create_account";

function columnFor(row: PortfolioRow): KanbanColumnKey {
  if (row.dealstageId !== null) {
    const byStage = DEALSTAGE_TO_COLUMN[row.dealstageId];
    if (byStage) return byStage;
  }
  const fallback = STAGE_FALLBACK[row.stage as PortfolioStage];
  return fallback ?? DEFAULT_COLUMN;
}

export interface KanbanColumn {
  def: KanbanColumnDef;
  rows: PortfolioRow[];
  count: number;
  acvEur: number;
}

export function groupByStage(rows: PortfolioRow[]): KanbanColumn[] {
  const buckets = new Map<KanbanColumnKey, PortfolioRow[]>(
    KANBAN_COLUMNS.map((col) => [col.key, []])
  );

  for (const row of rows) {
    const key = columnFor(row);
    buckets.get(key)!.push(row);
  }

  return KANBAN_COLUMNS.map((def) => {
    const bucketRows = buckets.get(def.key)!;
    return {
      def,
      rows: bucketRows,
      count: bucketRows.length,
      acvEur: bucketRows.reduce((sum, r) => sum + r.revenue, 0),
    };
  });
}

// Flattens columns column-major (all rows of column 0, then column 1, ...)
// while skipping collapsed columns entirely - their rows aren't rendered, so
// they must not occupy flat-index slots either. Used by the container's
// keyboard-nav row list. flattenBoardOffsets below must stay in lockstep
// with this so a flatIndex computed from one always lands on the row this
// produces at that index.
export function flattenBoard(
  columns: KanbanColumn[],
  collapsedKeys: ReadonlySet<string>
): PortfolioRow[] {
  const out: PortfolioRow[] = [];
  for (const col of columns) {
    if (collapsedKeys.has(col.def.key)) continue;
    out.push(...col.rows);
  }
  return out;
}

// Per-column starting offset into the flattenBoard output above. A
// collapsed column's offset equals the next column's offset (it
// contributes zero rows), matching how flattenBoard skips it entirely.
export function flattenBoardOffsets(
  columns: KanbanColumn[],
  collapsedKeys: ReadonlySet<string>
): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const col of columns) {
    offsets.push(acc);
    if (!collapsedKeys.has(col.def.key)) acc += col.rows.length;
  }
  return offsets;
}

export interface KanbanCardFields {
  obMeetingLabel: string | null;
  experiencesCreated: number | null;
  /** Experience-mode label, always a string for experience columns, null otherwise. */
  experiencesLabel: string | null;
  firstEventLabel: string | null;
  lastTouchLabel: string | null;
  nextStep: string | null;
  /**
   * Ongoing-mode "<Type> · <relative>" label built from nextActivityAt/
   * nextActivityType. Null when the next activity IS a meeting - the
   * meeting gets its own dedicated line (nextMeetingLabel below) so showing
   * both here would duplicate it.
   */
  nextActivityLabel: string | null;
  /** Ongoing-mode relative label ("Today" / "In N days" / ...) for row.nextMeetingAt. */
  nextMeetingLabel: string | null;
}

const MONTH_ABBREVIATIONS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Formats an ISO / yyyy-mm-dd date string as "d MMM yyyy". Returns null when
// the input doesn't parse to a valid date.
function formatDMMMYYYY(dateStr: string): string | null {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;
  const day = date.getUTCDate();
  const month = MONTH_ABBREVIATIONS[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

// Whole-day difference between two ISO timestamps, comparing calendar day
// (UTC midnight), not raw milliseconds. Positive when `targetIso` is later.
function dayDiff(targetIso: string, nowIso: string): number | null {
  const target = new Date(targetIso);
  const now = new Date(nowIso);
  if (isNaN(target.getTime()) || isNaN(now.getTime())) return null;
  const targetMidnight = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const nowMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((targetMidnight - nowMidnight) / (1000 * 60 * 60 * 24));
}

// Shared day-diff -> relative label used by both the OB-meeting and next-
// activity card fields (Today / Tomorrow / In N days / Yesterday / N days ago).
function formatRelativeDayLabel(diff: number): string {
  if (diff === 0) return "Today";
  if (diff > 0) return diff === 1 ? "Tomorrow" : `In ${diff} days`;
  const daysAgo = Math.abs(diff);
  return daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`;
}

function formatObMeetingLabel(obMeetingAt: string | null, nowIso: string): string | null {
  if (obMeetingAt === null) return null;
  const diff = dayDiff(obMeetingAt, nowIso);
  if (diff === null) return null;
  return formatRelativeDayLabel(diff);
}

function formatNextActivityLabel(
  nextActivityAt: string | null,
  nextActivityType: string | null,
  nowIso: string
): string | null {
  if (!nextActivityAt) return null;
  const diff = dayDiff(nextActivityAt, nowIso);
  if (diff === null) return null;
  const type = nextActivityType ?? "Activity";
  return `${type} · ${formatRelativeDayLabel(diff)}`;
}

// Experience-mode fields are always-on: unlike firstEventLabel/obMeetingLabel,
// a missing/zero count is a meaningful state ("No experiences yet"), not an
// absence of data, so this never returns null for an experience column.
function formatExperiencesLabel(experiencesCreated: number | null | undefined): string {
  const n = experiencesCreated ?? 0;
  if (n <= 0) return "No experiences yet";
  return n === 1 ? "1 experience created" : `${n} experiences created`;
}

// Always-on for experience columns: hasHadEvent null/undefined behaves like
// false ("No events yet") rather than omitting the field. `!== true` also
// absorbs the cached pre-deploy `undefined` case (the field didn't exist yet
// when the response was cached).
function formatFirstEventLabel(hasHadEvent: boolean | null | undefined, latestEventAt: string | null): string {
  if (hasHadEvent !== true) return "No events yet";
  const formattedDate = latestEventAt ? formatDMMMYYYY(latestEventAt) : null;
  return formattedDate ? `First event created · ${formattedDate}` : "First event created";
}

// Same relative-day formatting as formatObMeetingLabel, applied to the deal's
// next booked meeting (row.nextMeetingAt) for ongoing-mode kanban cards.
function formatNextMeetingLabel(nextMeetingAt: string | null, nowIso: string): string | null {
  if (nextMeetingAt === null) return null;
  const diff = dayDiff(nextMeetingAt, nowIso);
  if (diff === null) return null;
  return formatRelativeDayLabel(diff);
}

function formatLastTouchLabel(daysSinceContact: number | null): string | null {
  if (daysSinceContact === null) return null;
  if (daysSinceContact === 0) return "Today";
  if (daysSinceContact === 1) return "Yesterday";
  return `${daysSinceContact} days ago`;
}

export function buildKanbanCard(
  row: PortfolioRow,
  columnKey: KanbanColumnKey,
  nowIso: string
): KanbanCardFields {
  const def = KANBAN_COLUMNS.find((col) => col.key === columnKey);
  const mode: KanbanCardFieldMode = def ? def.fields : "ongoing";

  const isEarly = mode === "early";
  const isExperience = mode === "experience";
  const isOngoing = mode === "ongoing";

  // Computed up front so nextActivityLabel below can check whether it
  // actually has a value. type "Meeting" (hs_notes_next_activity) and
  // nextMeetingAt (hs_next_meeting_start_time) are independent HubSpot
  // properties that can disagree - if the type says Meeting but there's no
  // meeting time, we still need to show the activity line, otherwise the
  // card shows nothing about the upcoming activity at all.
  const nextMeetingLabel = isOngoing ? formatNextMeetingLabel(row.nextMeetingAt, nowIso) : null;
  const suppressActivity = row.nextActivityType === "Meeting" && nextMeetingLabel !== null;

  return {
    obMeetingLabel: isEarly || isExperience ? formatObMeetingLabel(row.obMeetingAt, nowIso) : null,
    // `?? null` normalizes `undefined` to `null` (loose equivalent of the
    // `== null` checks elsewhere in this file). Without it, a cached
    // pre-deploy API response missing this field renders "undefined
    // experiences created" instead of the intended "No experiences yet".
    experiencesCreated: isExperience ? row.experiencesCreated ?? null : null,
    experiencesLabel: isExperience ? formatExperiencesLabel(row.experiencesCreated) : null,
    firstEventLabel: isExperience ? formatFirstEventLabel(row.hasHadEvent, row.latestEventAt) : null,
    lastTouchLabel: isOngoing ? formatLastTouchLabel(row.daysSinceContact) : null,
    // `?? null` normalizes `undefined` to `null` for the same reason as
    // experiencesCreated above: a stale cached response missing this field
    // must not render the literal text "Next: undefined".
    nextStep: isOngoing ? row.nextStep ?? null : null,
    // Suppressed only when nextMeetingLabel (computed above) actually has a
    // value - see the comment there for why we can't suppress on type alone.
    nextActivityLabel:
      isOngoing && !suppressActivity
        ? formatNextActivityLabel(row.nextActivityAt, row.nextActivityType, nowIso)
        : null,
    nextMeetingLabel,
  };
}

export const __test = { columnFor, formatDMMMYYYY, dayDiff };
