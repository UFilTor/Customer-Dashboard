import { describe, it, expect } from "vitest";
import { classifyPortfolioStage, isSignalApplicable, extractSortKey, getSortOptions, buildRow, __test } from "./portfolio";
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
    contactEmail: null,
    ...overrides,
  };
}

// Pipeline ids mirrored from src/lib/portfolio.ts. Inlined as literals here
// so the tests don't depend on internal exports.
const LIFECYCLE_PIPELINE = "166333631";
const RETENTION_PIPELINE = "1072518362";

describe("classifyPortfolioStage", () => {
  it("trusts a known customer_stage on the Lifecycle pipeline, falling back to Onboarding otherwise", () => {
    // Unrecognised / empty stages fall back to the pipeline entry stage.
    expect(classifyPortfolioStage("In progress", LIFECYCLE_PIPELINE)).toBe("Onboarding");
    expect(classifyPortfolioStage("", LIFECYCLE_PIPELINE)).toBe("Onboarding");
    // A known customer_stage wins regardless of pipeline: Lifecycle deals
    // that reached Adopted/Started must not hide under "Onboarding".
    expect(classifyPortfolioStage("Adopted", LIFECYCLE_PIPELINE)).toBe("Adopted");
    expect(classifyPortfolioStage("Live", LIFECYCLE_PIPELINE)).toBe("Started");
  });

  it("maps Retention customer_stage values directly", () => {
    expect(classifyPortfolioStage("Adopted", RETENTION_PIPELINE)).toBe("Adopted");
    expect(classifyPortfolioStage("Started", RETENTION_PIPELINE)).toBe("Started");
    expect(classifyPortfolioStage("Ramp Up", RETENTION_PIPELINE)).toBe("Ramp Up");
    expect(classifyPortfolioStage("Established", RETENTION_PIPELINE)).toBe("Established");
  });

  it("recovers underlying stage from substage when customer_stage is an overlay", () => {
    expect(classifyPortfolioStage("Hibernation", RETENTION_PIPELINE, "Started"))
      .toBe("Started");
    expect(classifyPortfolioStage("Product Hold", RETENTION_PIPELINE, "ramp up"))
      .toBe("Ramp Up");
    expect(classifyPortfolioStage("Hibernation", RETENTION_PIPELINE, "established"))
      .toBe("Established");
  });

  it("falls back to Adopted (not Established) for overlay stages without recoverable substage", () => {
    expect(classifyPortfolioStage("Hibernation", RETENTION_PIPELINE)).toBe("Adopted");
    expect(classifyPortfolioStage("Product Hold", RETENTION_PIPELINE, null)).toBe("Adopted");
  });

  it("falls back to Adopted for empty / unrecognised customer_stage on a Retention deal", () => {
    expect(classifyPortfolioStage("", RETENTION_PIPELINE)).toBe("Adopted");
    expect(classifyPortfolioStage("Some Future Stage", RETENTION_PIPELINE)).toBe("Adopted");
  });
});

describe("isSignalApplicable", () => {
  it("allows stuck_in_step only on Onboarding/Adopted/Started", () => {
    expect(isSignalApplicable("stuck_in_step", "Onboarding")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Adopted")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Started")).toBe(true);
    expect(isSignalApplicable("stuck_in_step", "Ramp Up")).toBe(false);
    expect(isSignalApplicable("stuck_in_step", "Established")).toBe(false);
  });

  it("allows volume_declining only on Ramp Up + Established", () => {
    expect(isSignalApplicable("volume_declining", "Onboarding")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Adopted")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Started")).toBe(false);
    expect(isSignalApplicable("volume_declining", "Ramp Up")).toBe(true);
    expect(isSignalApplicable("volume_declining", "Established")).toBe(true);
  });

  it("allows overdue_invoices on every stage", () => {
    for (const stage of ["Onboarding", "Adopted", "Started", "Ramp Up", "Established"] as const) {
      expect(isSignalApplicable("overdue_invoices", stage)).toBe(true);
    }
  });
});

describe("extractSortKey", () => {
  it("returns universal values", () => {
    expect(extractSortKey(row({ revenue: 1234 }), "revenue")).toBe(1234);
    expect(extractSortKey(row({ healthScore: 55 }), "health")).toBe(55);
    expect(extractSortKey(row({ daysSinceContact: 12 }), "last_contact")).toBe(12);
    expect(extractSortKey(row({ name: "Acme" }), "name")).toBe("Acme");
  });

  it("returns null for signal-specific keys when signal is not firing", () => {
    expect(extractSortKey(row(), "oldest_outstanding")).toBeNull();
    expect(extractSortKey(row(), "biggest_pct_drop")).toBeNull();
  });

  it("returns signal-specific values when present", () => {
    expect(extractSortKey(row({ overdueDays: 14 }), "oldest_outstanding")).toBe(14);
    expect(extractSortKey(row({ outstandingEur: 5000 }), "value_overdue")).toBe(5000);
    expect(extractSortKey(row({ volumeDropPct: 0.7 }), "biggest_pct_drop")).toBe(0.7);
  });

  it("returns daysUntilDue for due_soonest sort on open invoices", () => {
    expect(extractSortKey(row({ daysUntilDue: 5 }), "due_soonest")).toBe(5);
    expect(extractSortKey(row(), "due_soonest")).toBeNull();
  });
});

describe("getSortOptions", () => {
  it("returns universal sorts when no signal is selected", () => {
    const opts = getSortOptions([]);
    const keys = opts.map((o) => o.key);
    expect(keys).toContain("urgency");
    expect(keys).toContain("revenue");
    expect(keys).not.toContain("oldest_outstanding");
  });

  it("adds signal-specific sorts when exactly one signal is selected", () => {
    const opts = getSortOptions(["overdue_invoices"]);
    const keys = opts.map((o) => o.key);
    expect(keys).toContain("urgency");
    expect(keys).toContain("oldest_outstanding");
    expect(keys).toContain("value_overdue");
    expect(keys).toContain("count_overdue");
  });

  it("omits signal-specific sorts when 2+ signals are selected", () => {
    const opts = getSortOptions(["overdue_invoices", "wish_to_churn"]);
    const keys = opts.map((o) => o.key);
    expect(keys).toContain("urgency");
    expect(keys).not.toContain("oldest_outstanding");
    expect(keys).not.toContain("wish_flagged_recent");
  });
});

const nowIso = "2026-05-03T00:00:00.000Z";

describe("buildRow", () => {
  const baseInput = {
    nowIso,
    contactEmail: null as string | null,
    company: {
      id: "100",
      name: "Acme",
      domain: "acme.com",
      ownerId: "1939229547",
      ownerName: "Filip",
      healthScore: null as number | null,
      revenue: 12000,
      notesLastContacted: null as string | null,
      volume3m: 0,
      volume6m: 0,
      upcomingEvents: 5 as number | null,
      experiencesCreated: null as number | null,
      hasHadEvent: null as boolean | null,
      latestEventAt: null as string | null,
    },
    deal: {
      dealId: "500",
      customerStage: "Established",
      customerSubstage: null as string | null,
      pipelineId: RETENTION_PIPELINE,
      enteredStageDate: "2026-04-01T00:00:00.000Z",
      customerLiveDate: "2025-09-01T00:00:00.000Z",
      nextStep: null as string | null,
      obMeetingAt: null as string | null,
      nextMeetingAt: null as string | null,
      nextActivityAt: null as string | null,
      nextActivityType: null as string | null,
      unpaidInvoice: false,
      invoiceDueDate: null as string | null,
      outstandingEur: null as number | null,
      overdueDays: null as number | null,
      daysUntilDue: null as number | null,
      openInvoiceCount: null as number | null,
      wishToChurn: false,
      churnReason: null as string | null,
      wishToChurnAt: null as string | null,
      daysInStep: null as number | null,
      expectedDaysInStep: null as number | null,
      payStatus: null as string | null,
      estimatedAdoptionDate: null as string | null,
      hibernationStart: null as string | null,
      hibernationEnd: null as string | null,
      productHoldStart: null as string | null,
      productHoldEnd: null as string | null,
      pauseStart: null as string | null,
      pauseEnd: null as string | null,
    },
  };

  it("collects no signals for a healthy row", () => {
    const r = buildRow(baseInput);
    expect(r.signals).toEqual([]);
    expect(r.stage).toBe("Established");
    expect(r.revenue).toBe(12000);
  });

  it("drops volume_declining on Onboarding stage even if data would fire it", () => {
    const r = buildRow({
      ...baseInput,
      company: { ...baseInput.company, volume3m: 1000, volume6m: 5000 },
      deal: { ...baseInput.deal, customerStage: "Onboarding" },
    });
    expect(r.signals.find((s) => s.kind === "volume_declining")).toBeUndefined();
  });

  it("drops stuck_in_step on Established stage even if days exceed expected", () => {
    const r = buildRow({
      ...baseInput,
      deal: { ...baseInput.deal, customerStage: "Established", daysInStep: 90, expectedDaysInStep: 30 },
    });
    expect(r.signals.find((s) => s.kind === "stuck_in_step")).toBeUndefined();
  });

  it("populates signal-specific sort fields when overdue invoice fires", () => {
    const r = buildRow({
      ...baseInput,
      deal: {
        ...baseInput.deal,
        unpaidInvoice: true,
        invoiceDueDate: "2026-04-20T00:00:00.000Z",
        outstandingEur: 4500,
        overdueDays: 13,
        openInvoiceCount: 2,
      },
    });
    expect(r.signals[0].kind).toBe("overdue_invoice");
    expect(r.overdueDays).toBe(13);
    expect(r.outstandingEur).toBe(4500);
    expect(r.openInvoiceCount).toBe(2);
  });

  it("threads dealstageId, pipelineId, nextStep, and company event fields onto the row", () => {
    const r = buildRow({
      ...baseInput,
      company: {
        ...baseInput.company,
        experiencesCreated: 4,
        hasHadEvent: true,
        latestEventAt: "2026-03-15",
      },
      deal: {
        ...baseInput.deal,
        dealstageId: "1899766980",
        nextStep: "Call about launch",
        nextActivityAt: "2026-05-10T09:00:00.000Z",
        nextActivityType: "Task",
      },
    });
    expect(r.dealstageId).toBe("1899766980");
    expect(r.pipelineId).toBe(RETENTION_PIPELINE);
    expect(r.nextStep).toBe("Call about launch");
    expect(r.experiencesCreated).toBe(4);
    expect(r.hasHadEvent).toBe(true);
    expect(r.latestEventAt).toBe("2026-03-15");
    expect(r.obMeetingAt).toBeNull();
    expect(r.nextActivityAt).toBe("2026-05-10T09:00:00.000Z");
    expect(r.nextActivityType).toBe("Task");
  });

  it("threads dealId, nextMeetingAt, and contactEmail onto the row", () => {
    const r = buildRow({
      ...baseInput,
      contactEmail: "person@example.com",
      deal: {
        ...baseInput.deal,
        dealId: "999",
        nextMeetingAt: "2026-05-06T09:00:00.000Z",
      },
    });
    expect(r.dealId).toBe("999");
    expect(r.nextMeetingAt).toBe("2026-05-06T09:00:00.000Z");
    expect(r.contactEmail).toBe("person@example.com");
  });

  it("defaults nextMeetingAt and contactEmail to null when not provided", () => {
    const r = buildRow(baseInput);
    expect(r.dealId).toBe("500");
    expect(r.nextMeetingAt).toBeNull();
    expect(r.contactEmail).toBeNull();
  });
});

describe("nextActivityTypeLabel", () => {
  it("maps the task object-type prefix", () => {
    expect(__test.nextActivityTypeLabel("0-27-513733934284")).toBe("Task");
  });

  it("maps the meeting object-type prefix", () => {
    expect(__test.nextActivityTypeLabel("0-47-513361609926")).toBe("Meeting");
  });

  it("falls back to Activity for an unrecognized prefix", () => {
    expect(__test.nextActivityTypeLabel("0-99-513361609926")).toBe("Activity");
  });

  it("returns null for null/empty input, and Activity for unparseable non-empty input", () => {
    expect(__test.nextActivityTypeLabel(null)).toBeNull();
    expect(__test.nextActivityTypeLabel(undefined)).toBeNull();
    expect(__test.nextActivityTypeLabel("")).toBeNull();
    expect(__test.nextActivityTypeLabel("garbage")).toBe("Activity");
  });
});

describe("aggregatePayload", () => {
  it("counts stages and signals correctly", () => {
    const rows = [
      row({ stage: "Onboarding", signals: [{ kind: "stuck_in_step", severity: "warn", title: "x", detail: "y" }] }),
      row({ stage: "Established", signals: [{ kind: "overdue_invoice", severity: "bad", title: "x", detail: "y" }] }),
      row({ stage: "Established", signals: [] }),
    ];
    const out = __test.aggregatePayload(rows);
    expect(out.totalsByStage.Onboarding).toBe(1);
    expect(out.totalsByStage.Established).toBe(2);
    expect(out.totalsBySignal.stuck_in_step).toBe(1);
    expect(out.totalsBySignal.overdue_invoices).toBe(1);
  });

  it("counts the synthesized open invoice via title", () => {
    const rows = [
      row({ stage: "Adopted", signals: [{ kind: "overdue_invoice", severity: "warn", title: "Open invoice", detail: "1 open invoice" }] }),
      row({ stage: "Established", signals: [{ kind: "overdue_invoice", severity: "bad", title: "Overdue invoice", detail: "z" }] }),
    ];
    const out = __test.aggregatePayload(rows);
    expect(out.totalsBySignal.open_invoices).toBe(1);
    expect(out.totalsBySignal.overdue_invoices).toBe(1);
  });
});
