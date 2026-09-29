import { describe, it, expect } from "vitest";
import { parseAttendeeOwnerIds, startOfNthPastWorkDay } from "./onboarding";

describe("parseAttendeeOwnerIds", () => {
  it("splits HubSpot's semicolon-delimited multi-checkbox string", () => {
    expect(parseAttendeeOwnerIds("44912650;962517007")).toEqual([
      "44912650",
      "962517007",
    ]);
  });

  it("handles a single id", () => {
    expect(parseAttendeeOwnerIds("44912650")).toEqual(["44912650"]);
  });

  it("returns an empty list for null, undefined, and empty string", () => {
    // Calendar-synced meetings routinely have no attendee owners recorded.
    expect(parseAttendeeOwnerIds(null)).toEqual([]);
    expect(parseAttendeeOwnerIds(undefined)).toEqual([]);
    expect(parseAttendeeOwnerIds("")).toEqual([]);
  });

  it("trims whitespace and drops empty segments", () => {
    expect(parseAttendeeOwnerIds(" 44912650 ; ;962517007;")).toEqual([
      "44912650",
      "962517007",
    ]);
  });
});

describe("startOfNthPastWorkDay", () => {
  // Mirrors the Meeting Prep day strip, which reaches PAST_WEEKDAYS back from
  // today. The bulk window has to start where the strip starts, or the past
  // day tabs render countless until the user clicks them.
  const monday = new Date(2026, 8, 14); // Mon 14 Sep 2026

  it("counts back over weekdays only", () => {
    // Fri 11 -> Thu 10 -> Wed 9 -> Tue 8
    expect(startOfNthPastWorkDay(monday, 4)).toEqual(new Date(2026, 8, 8, 0, 0, 0, 0));
  });

  it("returns the start of the given day when n is 0", () => {
    expect(startOfNthPastWorkDay(monday, 0)).toEqual(new Date(2026, 8, 14, 0, 0, 0, 0));
  });

  it("skips the weekend when walking back from a Monday", () => {
    expect(startOfNthPastWorkDay(monday, 1)).toEqual(new Date(2026, 8, 11, 0, 0, 0, 0));
  });

  it("walks back from a weekend start without counting the weekend", () => {
    const saturday = new Date(2026, 8, 12);
    expect(startOfNthPastWorkDay(saturday, 1)).toEqual(new Date(2026, 8, 11, 0, 0, 0, 0));
  });

  it("normalises the time to midnight regardless of the input clock", () => {
    const afternoon = new Date(2026, 8, 14, 16, 45, 12, 500);
    expect(startOfNthPastWorkDay(afternoon, 1)).toEqual(new Date(2026, 8, 11, 0, 0, 0, 0));
  });
});
