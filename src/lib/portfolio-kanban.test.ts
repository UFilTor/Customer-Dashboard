import { describe, it, expect } from "vitest";
import {
  KANBAN_COLUMNS,
  groupByStage,
  buildKanbanCard,
  flattenBoard,
  flattenBoardOffsets,
  __test,
  type KanbanColumnKey,
} from "./portfolio-kanban";
import type { PortfolioRow } from "./types";

function row(overrides: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    id: "1",
    name: "Example",
    domain: null,
    ownerId: null,
    ownerName: null,
    stage: "Established",
    daysInStage: null,
    customerLiveDate: null,
    revenue: 0,
    healthScore: null,
    daysSinceContact: null,
    signals: [],
    overdueDays: null,
    daysUntilDue: null,
    outstandingEur: null,
    openInvoiceCount: null,
    daysSilent: null,
    healthDrop: null,
    daysPastExpectedStep: null,
    volumeDropPct: null,
    prior3mVolume: null,
    wishToChurnAt: null,
    dealStatus: null,
    estimatedAdoptionDate: null,
    dealstageId: null,
    pipelineId: "166333631",
    nextStep: null,
    experiencesCreated: null,
    hasHadEvent: null,
    latestEventAt: null,
    obMeetingAt: null,
    nextActivityAt: null,
    nextActivityType: null,
    dealId: null,
    nextMeetingAt: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    companyCountry: null,
    ...overrides,
  };
}

const nowIso = "2026-08-24T12:00:00.000Z";

describe("KANBAN_COLUMNS", () => {
  it("defines the 8 columns in board order", () => {
    expect(KANBAN_COLUMNS.map((c) => c.key)).toEqual([
      "create_account",
      "create_experience",
      "awaiting_meeting",
      "in_progress",
      "adopted",
      "started",
      "ramp_up",
      "established",
    ]);
  });
});

describe("groupByStage", () => {
  it("returns all 8 columns in order, each count 0, for empty input", () => {
    const cols = groupByStage([]);
    expect(cols.map((c) => c.def.key)).toEqual([
      "create_account",
      "create_experience",
      "awaiting_meeting",
      "in_progress",
      "adopted",
      "started",
      "ramp_up",
      "established",
    ]);
    for (const c of cols) {
      expect(c.count).toBe(0);
      expect(c.rows).toEqual([]);
      expect(c.acvEur).toBe(0);
    }
  });

  it("maps a row per known dealstageId to its column, including both retention ids", () => {
    const rows: PortfolioRow[] = [
      row({ id: "a", dealstageId: "1571910876" }),
      row({ id: "b", dealstageId: "1899766980" }),
      row({ id: "c", dealstageId: "875045332" }),
      row({ id: "d", dealstageId: "307938521" }),
      row({ id: "e", dealstageId: "307938522" }),
      row({ id: "f", dealstageId: "5691910345" }),
      row({ id: "g", dealstageId: "3460322544" }),
      row({ id: "h", dealstageId: "1486762226" }),
    ];
    const cols = groupByStage(rows);
    const byKey = new Map(cols.map((c) => [c.def.key, c]));
    expect(byKey.get("create_account")!.rows.map((r) => r.id)).toEqual(["a"]);
    expect(byKey.get("create_experience")!.rows.map((r) => r.id)).toEqual(["b"]);
    expect(byKey.get("awaiting_meeting")!.rows.map((r) => r.id)).toEqual(["c"]);
    expect(byKey.get("in_progress")!.rows.map((r) => r.id)).toEqual(["d"]);
    expect(byKey.get("adopted")!.rows.map((r) => r.id)).toEqual(["e"]);
    expect(byKey.get("started")!.rows.map((r) => r.id)).toEqual(["f"]);
    expect(byKey.get("ramp_up")!.rows.map((r) => r.id)).toEqual(["g"]);
    expect(byKey.get("established")!.rows.map((r) => r.id)).toEqual(["h"]);
  });

  it("falls back to the stage map when dealstageId is null", () => {
    const rows: PortfolioRow[] = [
      row({ id: "a", dealstageId: null, stage: "Onboarding" }),
      row({ id: "b", dealstageId: null, stage: "Adopted" }),
      row({ id: "c", dealstageId: null, stage: "Started" }),
      row({ id: "d", dealstageId: null, stage: "Ramp Up" }),
      row({ id: "e", dealstageId: null, stage: "Established" }),
    ];
    const cols = groupByStage(rows);
    const byKey = new Map(cols.map((c) => [c.def.key, c]));
    expect(byKey.get("create_account")!.rows.map((r) => r.id)).toEqual(["a"]);
    expect(byKey.get("adopted")!.rows.map((r) => r.id)).toEqual(["b"]);
    expect(byKey.get("started")!.rows.map((r) => r.id)).toEqual(["c"]);
    expect(byKey.get("ramp_up")!.rows.map((r) => r.id)).toEqual(["d"]);
    expect(byKey.get("established")!.rows.map((r) => r.id)).toEqual(["e"]);
  });

  it("falls back to the stage map when dealstageId is unknown", () => {
    const cols = groupByStage([row({ id: "z", dealstageId: "999", stage: "Onboarding" })]);
    const byKey = new Map(cols.map((c) => [c.def.key, c]));
    expect(byKey.get("create_account")!.rows.map((r) => r.id)).toEqual(["z"]);
  });

  it("never drops or duplicates a row", () => {
    const rows: PortfolioRow[] = [
      row({ id: "a", dealstageId: "1571910876" }),
      row({ id: "b", dealstageId: null, stage: "Adopted" }),
      row({ id: "c", dealstageId: "999", stage: "Established" }),
      row({ id: "d", dealstageId: "3460322544" }),
    ];
    const cols = groupByStage(rows);
    const totalCount = cols.reduce((sum, c) => sum + c.count, 0);
    expect(totalCount).toBe(rows.length);
    const outIds = cols.flatMap((c) => c.rows.map((r) => r.id)).sort();
    const inIds = rows.map((r) => r.id).sort();
    expect(outIds).toEqual(inIds);
  });

  it("preserves within-column input order", () => {
    const rows: PortfolioRow[] = [
      row({ id: "first", dealstageId: "307938522" }),
      row({ id: "second", dealstageId: "307938522" }),
      row({ id: "third", dealstageId: "307938522" }),
    ];
    const cols = groupByStage(rows);
    const adopted = cols.find((c) => c.def.key === "adopted")!;
    expect(adopted.rows.map((r) => r.id)).toEqual(["first", "second", "third"]);
  });

  it("sums revenue per column into acvEur", () => {
    const rows: PortfolioRow[] = [
      row({ id: "a", dealstageId: "307938522", revenue: 1000 }),
      row({ id: "b", dealstageId: "307938522", revenue: 2500 }),
      row({ id: "c", dealstageId: "1486762226", revenue: 300 }),
    ];
    const cols = groupByStage(rows);
    expect(cols.find((c) => c.def.key === "adopted")!.acvEur).toBe(3500);
    expect(cols.find((c) => c.def.key === "established")!.acvEur).toBe(300);
    expect(cols.find((c) => c.def.key === "create_account")!.acvEur).toBe(0);
  });

  it("does not throw and lands in create_account for a defensive unrecognized stage", () => {
    const weirdRow = { ...row({ id: "weird" }), stage: "Bogus Stage" } as unknown as PortfolioRow;
    const cols = groupByStage([weirdRow]);
    expect(cols.find((c) => c.def.key === "create_account")!.rows.map((r) => r.id)).toEqual(["weird"]);
  });
});

describe("buildKanbanCard", () => {
  it("early column: shows obMeetingLabel, nulls the experience/ongoing fields", () => {
    const card = buildKanbanCard(
      row({ obMeetingAt: "2026-08-25T09:00:00.000Z", nextStep: "should be null", experiencesCreated: 3, daysSinceContact: 2 }),
      "create_account",
      nowIso
    );
    expect(card.obMeetingLabel).toBe("Tomorrow");
    expect(card.experiencesCreated).toBeNull();
    expect(card.firstEventLabel).toBeNull();
    expect(card.lastTouchLabel).toBeNull();
    expect(card.nextStep).toBeNull();
  });

  it("early column: obMeetingAt null renders null (UI shows Not booked)", () => {
    const card = buildKanbanCard(row({ obMeetingAt: null }), "awaiting_meeting", nowIso);
    expect(card.obMeetingLabel).toBeNull();
  });

  it("experience column: adds experiencesCreated + firstEventLabel with a parseable date", () => {
    const card = buildKanbanCard(
      row({ experiencesCreated: 4, hasHadEvent: true, latestEventAt: "2026-08-12" }),
      "create_experience",
      nowIso
    );
    expect(card.experiencesCreated).toBe(4);
    expect(card.firstEventLabel).toBe("First event created · 12 Aug 2026");
  });

  it("experience column: firstEventLabel omits the date suffix when latestEventAt doesn't parse", () => {
    const card = buildKanbanCard(
      row({ experiencesCreated: 1, hasHadEvent: true, latestEventAt: "not-a-date" }),
      "create_experience",
      nowIso
    );
    expect(card.firstEventLabel).toBe("First event created");
  });

  it("experience column: hasHadEvent false -> No events yet", () => {
    const card = buildKanbanCard(row({ hasHadEvent: false, latestEventAt: null }), "create_experience", nowIso);
    expect(card.firstEventLabel).toBe("No events yet");
  });

  it("experience column: hasHadEvent null -> firstEventLabel behaves like false (No events yet)", () => {
    const card = buildKanbanCard(row({ hasHadEvent: null }), "create_experience", nowIso);
    expect(card.firstEventLabel).toBe("No events yet");
  });

  it("ongoing column: shows lastTouchLabel + nextStep, nulls the early/experience fields", () => {
    const card = buildKanbanCard(
      row({ daysSinceContact: 5, nextStep: "Call to check in", obMeetingAt: "2026-08-25T09:00:00.000Z", experiencesCreated: 2 }),
      "in_progress",
      nowIso
    );
    expect(card.lastTouchLabel).toBe("5 days ago");
    expect(card.nextStep).toBe("Call to check in");
    expect(card.obMeetingLabel).toBeNull();
    expect(card.experiencesCreated).toBeNull();
    expect(card.firstEventLabel).toBeNull();
  });

  it("ongoing column: lastTouchLabel day math (0/1/N/null)", () => {
    expect(buildKanbanCard(row({ daysSinceContact: 0 }), "adopted", nowIso).lastTouchLabel).toBe("Today");
    expect(buildKanbanCard(row({ daysSinceContact: 1 }), "adopted", nowIso).lastTouchLabel).toBe("Yesterday");
    expect(buildKanbanCard(row({ daysSinceContact: 7 }), "adopted", nowIso).lastTouchLabel).toBe("7 days ago");
    expect(buildKanbanCard(row({ daysSinceContact: null }), "adopted", nowIso).lastTouchLabel).toBeNull();
  });

  it("experience column: undefined new fields (cached pre-deploy response) produce null card fields and do not throw", () => {
    const staleRow = {
      ...row(),
      experiencesCreated: undefined as unknown as number | null,
      hasHadEvent: undefined as unknown as boolean | null,
      latestEventAt: undefined as unknown as string | null,
    };
    expect(() => buildKanbanCard(staleRow, "create_experience", nowIso)).not.toThrow();
    const card = buildKanbanCard(staleRow, "create_experience", nowIso);
    expect(card.experiencesCreated).toBeNull();
    expect(card.experiencesLabel).toBe("No experiences yet");
    expect(card.firstEventLabel).toBe("No events yet");
  });

  it("ongoing column: undefined nextStep (cached pre-deploy response) yields null and does not throw", () => {
    const staleRow = { ...row(), nextStep: undefined as unknown as string | null };
    expect(() => buildKanbanCard(staleRow, "in_progress", nowIso)).not.toThrow();
    expect(buildKanbanCard(staleRow, "in_progress", nowIso).nextStep).toBeNull();
  });

  it("obMeetingLabel day math: same day, +1, +3, -1, -4", () => {
    expect(buildKanbanCard(row({ obMeetingAt: "2026-08-24T23:00:00.000Z" }), "create_account", nowIso).obMeetingLabel).toBe("Today");
    expect(buildKanbanCard(row({ obMeetingAt: "2026-08-25T00:00:00.000Z" }), "create_account", nowIso).obMeetingLabel).toBe("Tomorrow");
    expect(buildKanbanCard(row({ obMeetingAt: "2026-08-27T00:00:00.000Z" }), "create_account", nowIso).obMeetingLabel).toBe("In 3 days");
    expect(buildKanbanCard(row({ obMeetingAt: "2026-08-23T00:00:00.000Z" }), "create_account", nowIso).obMeetingLabel).toBe("Yesterday");
    expect(buildKanbanCard(row({ obMeetingAt: "2026-08-20T00:00:00.000Z" }), "create_account", nowIso).obMeetingLabel).toBe("4 days ago");
  });
});

describe("buildKanbanCard: nextActivityLabel", () => {
  it("ongoing column: builds '<Type> · <relative>' from nextActivityAt + nextActivityType", () => {
    // Type "Meeting" is covered separately below - it's suppressed here since
    // nextMeetingLabel owns that line instead.
    const card = buildKanbanCard(
      row({ nextActivityAt: "2026-08-27T09:00:00.000Z", nextActivityType: "Call" }),
      "in_progress",
      nowIso
    );
    expect(card.nextActivityLabel).toBe("Call · In 3 days");
  });

  it("ongoing column: missing type falls back to 'Activity'", () => {
    const card = buildKanbanCard(
      row({ nextActivityAt: "2026-08-27T09:00:00.000Z", nextActivityType: null }),
      "adopted",
      nowIso
    );
    expect(card.nextActivityLabel).toBe("Activity · In 3 days");
  });

  it("ongoing column: null nextActivityAt -> null", () => {
    const card = buildKanbanCard(row({ nextActivityAt: null, nextActivityType: "Task" }), "adopted", nowIso);
    expect(card.nextActivityLabel).toBeNull();
  });

  it("early/experience columns: always null regardless of nextActivityAt", () => {
    const withActivity = row({ nextActivityAt: "2026-08-27T09:00:00.000Z", nextActivityType: "Task" });
    expect(buildKanbanCard(withActivity, "create_account", nowIso).nextActivityLabel).toBeNull();
    expect(buildKanbanCard(withActivity, "create_experience", nowIso).nextActivityLabel).toBeNull();
    expect(buildKanbanCard(withActivity, "awaiting_meeting", nowIso).nextActivityLabel).toBeNull();
  });
});

describe("buildKanbanCard: nextMeetingLabel", () => {
  it("ongoing column: relative label from row.nextMeetingAt", () => {
    const card = buildKanbanCard(
      row({ nextMeetingAt: "2026-08-27T09:00:00.000Z" }),
      "in_progress",
      nowIso
    );
    expect(card.nextMeetingLabel).toBe("In 3 days");
  });

  it("ongoing column: null nextMeetingAt -> null", () => {
    const card = buildKanbanCard(row({ nextMeetingAt: null }), "adopted", nowIso);
    expect(card.nextMeetingLabel).toBeNull();
  });

  it("early/experience columns: always null regardless of nextMeetingAt", () => {
    const withMeeting = row({ nextMeetingAt: "2026-08-27T09:00:00.000Z" });
    expect(buildKanbanCard(withMeeting, "create_account", nowIso).nextMeetingLabel).toBeNull();
    expect(buildKanbanCard(withMeeting, "create_experience", nowIso).nextMeetingLabel).toBeNull();
    expect(buildKanbanCard(withMeeting, "awaiting_meeting", nowIso).nextMeetingLabel).toBeNull();
  });
});

describe("buildKanbanCard: nextActivityLabel suppression when the activity is a meeting", () => {
  it("nextActivityType Meeting -> nextActivityLabel null, nextMeetingLabel set", () => {
    const card = buildKanbanCard(
      row({
        nextActivityAt: "2026-08-27T09:00:00.000Z",
        nextActivityType: "Meeting",
        nextMeetingAt: "2026-08-27T09:00:00.000Z",
      }),
      "in_progress",
      nowIso
    );
    expect(card.nextActivityLabel).toBeNull();
    expect(card.nextMeetingLabel).toBe("In 3 days");
  });

  it("task next activity + a booked meeting -> both labels set", () => {
    const card = buildKanbanCard(
      row({
        nextActivityAt: "2026-08-25T09:00:00.000Z",
        nextActivityType: "Task",
        nextMeetingAt: "2026-08-27T09:00:00.000Z",
      }),
      "adopted",
      nowIso
    );
    expect(card.nextActivityLabel).toBe("Task · Tomorrow");
    expect(card.nextMeetingLabel).toBe("In 3 days");
  });

  it("nextActivityType Meeting but no nextMeetingAt (disagreeing HubSpot properties) -> nextActivityLabel still shows, nextMeetingLabel null", () => {
    const card = buildKanbanCard(
      row({
        nextActivityAt: "2026-08-27T09:00:00.000Z",
        nextActivityType: "Meeting",
        nextMeetingAt: null,
      }),
      "in_progress",
      nowIso
    );
    expect(card.nextActivityLabel).toBe("Meeting · In 3 days");
    expect(card.nextMeetingLabel).toBeNull();
  });
});

describe("buildKanbanCard: experiencesLabel", () => {
  it("experience column: zero/null count -> 'No experiences yet'", () => {
    expect(buildKanbanCard(row({ experiencesCreated: 0 }), "create_experience", nowIso).experiencesLabel)
      .toBe("No experiences yet");
    expect(buildKanbanCard(row({ experiencesCreated: null }), "create_experience", nowIso).experiencesLabel)
      .toBe("No experiences yet");
  });

  it("experience column: singular vs. plural count", () => {
    expect(buildKanbanCard(row({ experiencesCreated: 1 }), "create_experience", nowIso).experiencesLabel)
      .toBe("1 experience created");
    expect(buildKanbanCard(row({ experiencesCreated: 4 }), "create_experience", nowIso).experiencesLabel)
      .toBe("4 experiences created");
  });

  it("non-experience columns: always null", () => {
    const withCount = row({ experiencesCreated: 4 });
    expect(buildKanbanCard(withCount, "create_account", nowIso).experiencesLabel).toBeNull();
    expect(buildKanbanCard(withCount, "in_progress", nowIso).experiencesLabel).toBeNull();
  });
});

describe("flattenBoard / flattenBoardOffsets", () => {
  const rows: PortfolioRow[] = [
    row({ id: "a", dealstageId: "1571910876" }), // create_account
    row({ id: "b", dealstageId: "1899766980" }), // create_experience
    row({ id: "c", dealstageId: "1899766980" }), // create_experience
    row({ id: "d", dealstageId: "875045332" }), // awaiting_meeting
    row({ id: "e", dealstageId: "307938521" }), // in_progress
  ];

  it("with nothing collapsed, flattens column-major and offsets match groupByStage order", () => {
    const cols = groupByStage(rows);
    const flat = flattenBoard(cols, new Set());
    expect(flat.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
    const offsets = flattenBoardOffsets(cols, new Set());
    expect(offsets).toEqual([0, 1, 3, 4, 5, 5, 5, 5]);
    // Every non-collapsed row's position in `flat` matches its column
    // offset + its index within the column's own rows array.
    cols.forEach((col, columnIdx) => {
      col.rows.forEach((r, rowIdx) => {
        expect(flat[offsets[columnIdx] + rowIdx]).toBe(r);
      });
    });
  });

  it("skip-collapsed: a collapsed column's rows are absent from the flat list", () => {
    const cols = groupByStage(rows);
    const collapsed = new Set(["create_experience"]);
    const flat = flattenBoard(cols, collapsed);
    expect(flat.map((r) => r.id)).toEqual(["a", "d", "e"]);
  });

  it("all-collapsed collapses the whole board to an empty list", () => {
    const cols = groupByStage(rows);
    const allKeys = new Set(KANBAN_COLUMNS.map((c) => c.key));
    expect(flattenBoard(cols, allKeys)).toEqual([]);
  });

  it("offsets stay consistent with flattenBoard when a middle column is collapsed", () => {
    const cols = groupByStage(rows);
    const collapsed = new Set(["create_experience"]);
    const flat = flattenBoard(cols, collapsed);
    const offsets = flattenBoardOffsets(cols, collapsed);
    // create_account (0 rows before it) -> offset 0
    expect(offsets[0]).toBe(0);
    // create_experience is collapsed: contributes 0, so the next column's
    // offset does not advance past create_account's contribution.
    expect(offsets[1]).toBe(1);
    // awaiting_meeting's offset equals create_experience's (skipped).
    expect(offsets[2]).toBe(1);
    expect(flat[offsets[2]].id).toBe("d");
    // in_progress comes after awaiting_meeting's 1 row.
    expect(offsets[3]).toBe(2);
    expect(flat[offsets[3]].id).toBe("e");
  });

  it("offsets array has one entry per column, including collapsed ones", () => {
    const cols = groupByStage(rows);
    const offsets = flattenBoardOffsets(cols, new Set(["awaiting_meeting"]));
    expect(offsets).toHaveLength(KANBAN_COLUMNS.length);
  });
});

describe("__test.columnFor", () => {
  it("exposes the internal column-resolution helper", () => {
    const key: KanbanColumnKey = __test.columnFor(row({ dealstageId: "1899766980" }));
    expect(key).toBe("create_experience");
  });
});
