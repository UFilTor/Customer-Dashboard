import { describe, it, expect, beforeEach } from "vitest";
import {
  getSnoozedCompanies,
  snoozeCompany,
  unsnoozeCompany,
  isCompanySnoozed,
} from "./snooze";

describe("snooze", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty array when no data stored", () => {
    expect(getSnoozedCompanies()).toEqual([]);
  });

  it("snoozes a company", () => {
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-04-01T00:00:00Z",
      companyName: "Test Co",
    });
    expect(getSnoozedCompanies()).toHaveLength(1);
    expect(isCompanySnoozed("1", "overdue_invoices")).toBe(true);
  });

  it("does not report snoozed for different signal", () => {
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-04-01T00:00:00Z",
      companyName: "Test Co",
    });
    expect(isCompanySnoozed("1", "gone_quiet")).toBe(false);
  });

  it("updates existing snooze for same company+signal", () => {
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-04-01T00:00:00Z",
      companyName: "Test Co",
    });
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-05-01T00:00:00Z",
      companyName: "Test Co",
    });
    const snoozed = getSnoozedCompanies();
    expect(snoozed).toHaveLength(1);
    expect(snoozed[0].snoozeUntil).toBe("2026-05-01T00:00:00Z");
  });

  it("unsnoozes a company", () => {
    snoozeCompany({
      companyId: "1",
      signal: "overdue_invoices",
      snoozeUntil: "2026-04-01T00:00:00Z",
      companyName: "Test Co",
    });
    unsnoozeCompany("1", "overdue_invoices");
    expect(isCompanySnoozed("1", "overdue_invoices")).toBe(false);
  });

  it("auto-cleans expired entries on read", () => {
    localStorage.setItem(
      "snoozed-companies",
      JSON.stringify([
        { companyId: "1", signal: "overdue_invoices", snoozeUntil: "2020-01-01T00:00:00Z", companyName: "Old" },
        { companyId: "2", signal: "gone_quiet", snoozeUntil: "2099-01-01T00:00:00Z", companyName: "Future" },
      ])
    );
    const result = getSnoozedCompanies();
    expect(result).toHaveLength(1);
    expect(result[0].companyId).toBe("2");
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("snoozed-companies", "not-json");
    expect(getSnoozedCompanies()).toEqual([]);
  });
});
