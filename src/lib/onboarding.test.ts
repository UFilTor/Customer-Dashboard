import { describe, it, expect } from "vitest";
import { parseAttendeeOwnerIds } from "./onboarding";

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
