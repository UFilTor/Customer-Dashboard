import { describe, it, expect } from "vitest";
import {
  daysSinceIso,
  extractInvoiceState,
  isExpansionScope,
  isLifecycleScope,
  isMeetingPrepPipeline,
  isRetentionScope,
} from "./meeting-prep";

describe("isMeetingPrepPipeline", () => {
  it("matches lifecycle, retention, and expansion pipelines", () => {
    expect(isMeetingPrepPipeline("166333631")).toBe(true);
    expect(isMeetingPrepPipeline("1072518362")).toBe(true);
    expect(isMeetingPrepPipeline("3687958771")).toBe(true);
  });
  it("rejects unrelated pipelines", () => {
    expect(isMeetingPrepPipeline("81267902")).toBe(false);
    expect(isMeetingPrepPipeline(undefined)).toBe(false);
    expect(isMeetingPrepPipeline("")).toBe(false);
  });
});

describe("isLifecycleScope", () => {
  it("matches active onboarding stages on the lifecycle pipeline", () => {
    // ONBOARDING_STAGES uses HubSpot internal values: Onboarding / Adoption / Live
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Onboarding" })).toBe(true);
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Adoption" })).toBe(true);
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Live" })).toBe(true);
  });
  it("rejects non-onboarding stages on the lifecycle pipeline", () => {
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Established" })).toBe(false);
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Ramp Up" })).toBe(false);
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Churned" })).toBe(false);
    expect(isLifecycleScope({ pipeline: "166333631" })).toBe(false);
  });
  it("rejects retention-pipeline deals even with onboarding-named stages", () => {
    expect(isLifecycleScope({ pipeline: "1072518362", customer_stage: "Adopted" })).toBe(false);
  });
});

describe("isRetentionScope", () => {
  it("matches retention-pipeline deals across all live stages", () => {
    expect(isRetentionScope({ pipeline: "1072518362" })).toBe(true);
    expect(isRetentionScope({ pipeline: "1072518362", customer_stage: "Adopted" })).toBe(true);
    expect(isRetentionScope({ pipeline: "1072518362", customer_stage: "Established" })).toBe(true);
    expect(isRetentionScope({ pipeline: "1072518362", customer_stage: "" })).toBe(true);
  });

  it("rejects deals on other pipelines", () => {
    expect(isRetentionScope({ pipeline: "166333631" })).toBe(false);
    expect(isRetentionScope({ pipeline: "81267902" })).toBe(false);
    expect(isRetentionScope({})).toBe(false);
  });

  it("rejects Churned even on the retention pipeline", () => {
    expect(isRetentionScope({ pipeline: "1072518362", customer_stage: "Churned" })).toBe(false);
  });
});

describe("isExpansionScope", () => {
  it("matches expansion-pipeline deals across all non-closed-lost stages", () => {
    expect(isExpansionScope({ pipeline: "3687958771" })).toBe(true);
    expect(isExpansionScope({ pipeline: "3687958771", dealstage: "5112925390" })).toBe(true); // In Conversation
    expect(isExpansionScope({ pipeline: "3687958771", dealstage: "5112925394" })).toBe(true); // Closed Won
  });

  it("rejects deals on other pipelines", () => {
    expect(isExpansionScope({ pipeline: "166333631" })).toBe(false);
    expect(isExpansionScope({ pipeline: "1072518362" })).toBe(false);
    expect(isExpansionScope({})).toBe(false);
  });

  it("rejects Closed Lost even on the expansion pipeline", () => {
    expect(
      isExpansionScope({ pipeline: "3687958771", dealstage: "5112925395" })
    ).toBe(false);
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

  it("counts open invoices from understory_number_of_unpaid_invoices", () => {
    const r = extractInvoiceState(
      { understory_number_of_unpaid_invoices: "3" },
      "2026-05-02T00:00:00.000Z"
    );
    expect(r.open).toBe(3);
  });

  it("flags overdue when unpaid count > 0 AND earliest unpaid due date is in past", () => {
    const r = extractInvoiceState(
      {
        understory_number_of_unpaid_invoices: "1",
        understory_earliest_unpaid_invoice_due_date: "2026-04-24T00:00:00.000Z",
        understory_unpaid_amount_local_currency: "4200",
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
        understory_number_of_unpaid_invoices: "1",
        understory_earliest_unpaid_invoice_due_date: "2026-05-15T00:00:00.000Z",
        understory_unpaid_amount_local_currency: "4200",
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
