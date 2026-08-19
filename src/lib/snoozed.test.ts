import { describe, it, expect, beforeEach } from "vitest";
import { getSnoozed, getSnoozedIds, getSnoozeUntil, snoozeCompany, unsnoozeCompany } from "./snoozed";

const KEY = "ud-v2-snoozed";
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
});

describe("snoozed", () => {
  it("snoozes and reads back", () => {
    snoozeCompany("123", Date.now() + 7 * DAY);
    expect(getSnoozedIds().has("123")).toBe(true);
    expect(getSnoozeUntil("123")).toBeGreaterThan(Date.now());
  });

  it("unsnoozes", () => {
    snoozeCompany("123", Date.now() + 7 * DAY);
    unsnoozeCompany("123");
    expect(getSnoozedIds().has("123")).toBe(false);
  });

  it("prunes expired entries on read", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { companyId: "expired", snoozedAt: Date.now() - 8 * DAY, until: Date.now() - DAY },
        { companyId: "active", snoozedAt: Date.now(), until: Date.now() + DAY },
      ])
    );
    const ids = getSnoozedIds();
    expect(ids.has("expired")).toBe(false);
    expect(ids.has("active")).toBe(true);
  });

  it("rejects a snooze in the past", () => {
    snoozeCompany("123", Date.now() - DAY);
    expect(getSnoozedIds().has("123")).toBe(false);
  });

  it("re-snoozing replaces the old entry", () => {
    snoozeCompany("123", Date.now() + DAY);
    const later = Date.now() + 30 * DAY;
    snoozeCompany("123", later);
    expect(getSnoozed().length).toBe(1);
    expect(getSnoozeUntil("123")).toBe(later);
  });

  it("survives a poisoned blob", () => {
    localStorage.setItem(KEY, JSON.stringify([null, 42, { companyId: 5 }, { companyId: "ok", snoozedAt: 1, until: Date.now() + DAY }, "x"]));
    expect(getSnoozedIds().has("ok")).toBe(true);
    expect(getSnoozed().length).toBe(1);
    localStorage.setItem(KEY, "not json {");
    expect(getSnoozed()).toEqual([]);
  });
});
