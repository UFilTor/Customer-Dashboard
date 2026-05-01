import { describe, it, expect } from "vitest";
import {
  isRetentionDeal,
  extractInvoiceState,
  daysSinceIso,
} from "./retention";

describe("isRetentionDeal", () => {
  it("matches deals on the retention pipeline with allowed stages", () => {
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Adopted" })).toBe(true);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Started" })).toBe(true);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Ramp Up" })).toBe(true);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Established" })).toBe(true);
  });

  it("rejects deals on other pipelines", () => {
    expect(isRetentionDeal({ pipeline: "166333631", customer_stage: "Established" })).toBe(false);
    expect(isRetentionDeal({ pipeline: "81267902", customer_stage: "Adopted" })).toBe(false);
  });

  it("rejects retention-pipeline deals in other stages", () => {
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Churned" })).toBe(false);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "" })).toBe(false);
    expect(isRetentionDeal({ pipeline: "1072518362", customer_stage: "Unknown" })).toBe(false);
  });
});

describe("extractInvoiceState", () => {
  it("returns zero state when nothing is set", () => {
    expect(extractInvoiceState({}, "2026-05-02T00:00:00.000Z")).toEqual({
      open: 0,
      overdue: 0,
      overdueDays: null,
      outstandingEur: null,
    });
  });

  it("counts open invoices from number_of_open_invoices", () => {
    const r = extractInvoiceState({ number_of_open_invoices: "3" }, "2026-05-02T00:00:00.000Z");
    expect(r.open).toBe(3);
  });

  it("flags overdue when unpaid_invoice=true AND invoice_due_date is in past", () => {
    const r = extractInvoiceState(
      {
        unpaid_invoice: "true",
        invoice_due_date: "2026-04-24T00:00:00.000Z",
        outstanding_amount: "4200",
        deal_currency_code: "EUR",
      },
      "2026-05-02T00:00:00.000Z"
    );
    expect(r.overdue).toBe(1);
    expect(r.overdueDays).toBe(8);
    expect(r.outstandingEur).toBe(4200);
  });

  it("does not flag overdue when due date is in future", () => {
    const r = extractInvoiceState(
      {
        unpaid_invoice: "true",
        invoice_due_date: "2026-05-15T00:00:00.000Z",
        outstanding_amount: "4200",
      },
      "2026-05-02T00:00:00.000Z"
    );
    expect(r.overdue).toBe(0);
    expect(r.overdueDays).toBeNull();
  });
});

describe("daysSinceIso", () => {
  it("returns the number of full days between now and the given date", () => {
    expect(daysSinceIso("2026-05-02T00:00:00.000Z", "2026-04-25T00:00:00.000Z")).toBe(7);
  });

  it("returns null for missing or invalid dates", () => {
    expect(daysSinceIso("2026-05-02T00:00:00.000Z", null)).toBeNull();
    expect(daysSinceIso("2026-05-02T00:00:00.000Z", "")).toBeNull();
    expect(daysSinceIso("2026-05-02T00:00:00.000Z", "not-a-date")).toBeNull();
  });
});
