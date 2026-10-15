import { describe, it, expect } from "vitest";
import { feeFromDeals, parseAttendeeOwnerIds, startOfNthPastWorkDay } from "./onboarding";
import { formatFee } from "./packages";

describe("formatFee", () => {
  it("labels a yearly price per year, not per month", () => {
    expect(formatFee("3588", "SEK", "Yearly")).toBe("3,588 SEK/yr");
  });

  it("labels a monthly price per month", () => {
    expect(formatFee("299", "sek", "Monthly")).toBe("299 SEK/mo");
  });

  it("shows no period when the billing schedule is blank", () => {
    expect(formatFee("3588", "SEK", undefined)).toBe("3,588 SEK");
    expect(formatFee("3588", "SEK", "")).toBe("3,588 SEK");
  });

  it("returns null for a missing, zero or unparseable amount, or a blank currency", () => {
    expect(formatFee(undefined, "SEK", "Yearly")).toBeNull();
    expect(formatFee("0", "SEK", "Yearly")).toBeNull();
    expect(formatFee("abc", "SEK", "Yearly")).toBeNull();
    expect(formatFee("3588", " ", "Yearly")).toBeNull();
  });
});

describe("feeFromDeals", () => {
  const lifecycle = { core_net_price__local_currency: "3588", deal_currency_code: "SEK", billing_schedule: "Yearly" };
  const sales = {
    isPriced: true,
    deal: { properties: { core_net_price__local_currency: "2688", deal_currency_code: "SEK", billing_schedule: "Monthly" } },
  };

  it("prefers the lifecycle deal's price over the sales deal", () => {
    expect(feeFromDeals(lifecycle, sales)).toBe("3,588 SEK/yr");
  });

  it("falls back to the priced sales deal, with that deal's schedule, when the lifecycle deal has no price", () => {
    expect(feeFromDeals({ deal_currency_code: "SEK", billing_schedule: "Yearly" }, sales)).toBe("2,688 SEK/mo");
  });

  it("treats a zero lifecycle price as no price and falls back", () => {
    expect(feeFromDeals({ core_net_price__local_currency: "0", deal_currency_code: "SEK" }, sales)).toBe("2,688 SEK/mo");
  });

  it("doesn't borrow an unpriced sales deal or a null fallback", () => {
    expect(feeFromDeals({ deal_currency_code: "SEK" }, { ...sales, isPriced: false })).toBeNull();
    expect(feeFromDeals({ deal_currency_code: "SEK" }, null)).toBeNull();
  });

  it("uses the legacy currency property when deal_currency_code is blank", () => {
    expect(feeFromDeals({ core_net_price__local_currency: "199", currency: "NOK", billing_schedule: "Monthly" }, null)).toBe("199 NOK/mo");
  });
});

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
