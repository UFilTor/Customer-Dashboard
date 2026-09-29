import { describe, it, expect } from "vitest";
import { computeWatchOutSignals, HIDDEN_SIGNALS, PORTFOLIO_SIGNALS, PORTFOLIO_SIGNAL_MAP } from "./signals";

const nowIso = "2026-05-02T00:00:00.000Z";

function ctx(overrides: Partial<Parameters<typeof computeWatchOutSignals>[0]> = {}) {
  // Default ctx is a healthy state — overrides flip individual signals on. We
  // set upcomingEvents to a positive number (rather than null/0) so the
  // "no_future_events" rule doesn't fire by default in every other test; the
  // dedicated null/0 case overrides it explicitly.
  return {
    nowIso,
    unpaidInvoice: false,
    invoiceDueDate: null,
    outstandingEur: null,
    overdueDays: null,
    wishToChurn: false,
    churnReason: null,
    volume3m: 0,
    volume6m: 0,
    healthScore: null,
    upcomingEvents: 5 as number | null,
    notesLastContacted: null,
    daysInStep: null,
    expectedDaysInStep: null,
    ...overrides,
  };
}

describe("computeWatchOutSignals", () => {
  it("returns no signals for a healthy account", () => {
    const out = computeWatchOutSignals(ctx({
      volume3m: 12000,
      volume6m: 22000,
      healthScore: 80,
      upcomingEvents: 12,
      notesLastContacted: "2026-04-25T00:00:00.000Z",
    }));
    expect(out).toEqual([]);
  });

  it("flags overdue invoice as bad", () => {
    const out = computeWatchOutSignals(ctx({
      unpaidInvoice: true,
      invoiceDueDate: "2026-04-24T00:00:00.000Z",
      outstandingEur: 4200,
      overdueDays: 8,
    }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "overdue_invoice", severity: "bad" });
    expect(out[0].detail).toContain("8");
    expect(out[0].detail).toContain("4 200");
  });

  it("flags wish_to_churn as bad", () => {
    const out = computeWatchOutSignals(ctx({
      wishToChurn: true,
      churnReason: "Pricing pressure",
    }));
    expect(out).toEqual([
      expect.objectContaining({ kind: "wish_to_churn", severity: "bad", detail: "Pricing pressure" }),
    ]);
  });

  it("flags volume declining when last 3m < 50% of prior 3m", () => {
    // prior3m = volume6m - volume3m = 20000 - 8000 = 12000. 8000 < 6000? No, 8000 > 6000. Should NOT flag.
    expect(computeWatchOutSignals(ctx({ volume3m: 8000, volume6m: 20000 }))).toEqual([]);
    // 5000 < 0.5 * 12000 = 6000 -> flag
    const out = computeWatchOutSignals(ctx({ volume3m: 5000, volume6m: 17000 }));
    expect(out[0]).toMatchObject({ kind: "volume_declining", severity: "bad" });
  });

  it("flags health_dropped as warn when score < 60", () => {
    const out = computeWatchOutSignals(ctx({ healthScore: 55 }));
    expect(out[0]).toMatchObject({ kind: "health_dropped", severity: "warn" });
  });

  it("flags no_future_events only when upcomingEvents score is exactly 0", () => {
    const out = computeWatchOutSignals(ctx({ upcomingEvents: 0 }));
    expect(out[0]).toMatchObject({ kind: "no_future_events", severity: "bad" });
    // Score 0.20 = 1 event scheduled, must NOT fire
    const out020 = computeWatchOutSignals(ctx({ upcomingEvents: 0.2 }));
    expect(out020).toEqual([]);
    // Null = data missing, must NOT fire
    const outNull = computeWatchOutSignals(ctx({ upcomingEvents: null }));
    expect(outNull).toEqual([]);
  });

  it("hides gone_quiet everywhere while it is in HIDDEN_SIGNALS", () => {
    // Detection (warn at 30 days, bad at 45+) is kept; the switch drops it for
    // staged and unstaged callers alike, and from the UI's signal list.
    expect(HIDDEN_SIGNALS.has("gone_quiet")).toBe(true);
    const out46 = computeWatchOutSignals(ctx({ notesLastContacted: "2026-03-16T00:00:00.000Z" })); // 47d
    expect(out46.some((s) => s.kind === "gone_quiet")).toBe(false);
    const staged = computeWatchOutSignals(ctx({ notesLastContacted: "2026-03-16T00:00:00.000Z", stage: "Established" }));
    expect(staged.some((s) => s.kind === "gone_quiet")).toBe(false);
    expect(PORTFOLIO_SIGNALS.map((s) => s.key)).not.toContain("gone_quiet");
    expect(PORTFOLIO_SIGNAL_MAP.gone_quiet.label).toBe("Gone quiet");
  });

  it("flags stuck_in_step when daysInStep > expectedDaysInStep", () => {
    const out = computeWatchOutSignals(ctx({ daysInStep: 45, expectedDaysInStep: 30 }));
    expect(out[0]).toMatchObject({ kind: "stuck_in_step", severity: "warn" });
  });

  it("orders by severity (bad before warn) then by appearance", () => {
    const out = computeWatchOutSignals(ctx({
      healthScore: 50,                    // warn
      unpaidInvoice: true,                // bad
      invoiceDueDate: "2026-04-24T00:00:00.000Z",
      outstandingEur: 100,
      overdueDays: 8,
      upcomingEvents: 0,                  // bad (now)
    }));
    expect(out.map((s) => s.kind)).toEqual([
      "overdue_invoice",
      "no_future_events",
      "health_dropped",
    ]);
  });
});
