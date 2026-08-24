import { describe, it, expect } from "vitest";
import { __test } from "./portfolio";

const { pickObMeetingDate } = __test;

// Frozen "now" so upcoming vs. past is deterministic regardless of when the
// test runs.
const NOW_ISO = "2026-08-24T12:00:00.000Z";

describe("pickObMeetingDate", () => {
  it("returns null for an empty meeting list", () => {
    expect(pickObMeetingDate([], NOW_ISO)).toBeNull();
  });

  it("prefers the soonest upcoming onboarding meeting over any past one", () => {
    const meetings = [
      { startTime: "2026-08-20T10:00:00.000Z", activityType: "Onboarding" }, // past
      { startTime: "2026-08-30T10:00:00.000Z", activityType: "Onboarding" }, // later upcoming
      { startTime: "2026-08-25T10:00:00.000Z", activityType: "Onboarding" }, // soonest upcoming
    ];
    expect(pickObMeetingDate(meetings, NOW_ISO)).toBe("2026-08-25T10:00:00.000Z");
  });

  it("falls back to the most recent past meeting when none are upcoming", () => {
    const meetings = [
      { startTime: "2026-08-10T10:00:00.000Z", activityType: "Onboarding" }, // older
      { startTime: "2026-08-20T10:00:00.000Z", activityType: "Bloom Onboarding" }, // most recent past
    ];
    expect(pickObMeetingDate(meetings, NOW_ISO)).toBe("2026-08-20T10:00:00.000Z");
  });

  it("ignores meetings whose activity type isn't an onboarding type", () => {
    const meetings = [
      { startTime: "2026-08-25T10:00:00.000Z", activityType: "Discovery call" },
      { startTime: "2026-08-26T10:00:00.000Z", activityType: null },
    ];
    expect(pickObMeetingDate(meetings, NOW_ISO)).toBeNull();
  });

  it("mixes onboarding and non-onboarding meetings, only considering the former", () => {
    const meetings = [
      { startTime: "2026-08-23T10:00:00.000Z", activityType: "Discovery call" }, // ignored, would be soonest
      { startTime: "2026-08-28T10:00:00.000Z", activityType: "Grow onboarding meeting" },
    ];
    expect(pickObMeetingDate(meetings, NOW_ISO)).toBe("2026-08-28T10:00:00.000Z");
  });

  it("treats a meeting starting exactly now as upcoming, not past", () => {
    const meetings = [{ startTime: NOW_ISO, activityType: "Onboarding" }];
    expect(pickObMeetingDate(meetings, NOW_ISO)).toBe(NOW_ISO);
  });
});
