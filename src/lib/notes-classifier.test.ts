import { describe, expect, it } from "vitest";
import { noteFlagsToSignals, parseNoteFlags } from "./notes-classifier";

const engagements = [
  { timestamp: "2026-07-28T10:00:00.000Z", title: "Check-in call" },
  { timestamp: "2026-07-10T10:00:00.000Z", title: "Onboarding meeting" },
];

describe("parseNoteFlags", () => {
  it("parses valid flags and attaches engagement metadata", () => {
    const flags = parseNoteFlags(
      '[{"i": 0, "kind": "churn_risk_mentioned", "evidence": "we are evaluating alternatives"}]',
      engagements
    );
    expect(flags).toEqual([
      {
        kind: "churn_risk_mentioned",
        evidence: "we are evaluating alternatives",
        engagementDate: "2026-07-28T10:00:00.000Z",
        engagementTitle: "Check-in call",
      },
    ]);
  });

  it("returns [] on malformed JSON or prose", () => {
    expect(parseNoteFlags("no json here", engagements)).toEqual([]);
    expect(parseNoteFlags("[{broken", engagements)).toEqual([]);
  });

  it("drops out-of-range indices and unknown kinds", () => {
    const flags = parseNoteFlags(
      '[{"i": 9, "kind": "pricing_complaint", "evidence": "x"}, {"i": 0, "kind": "made_up_kind", "evidence": "y"}]',
      engagements
    );
    expect(flags).toEqual([]);
  });

  it("keeps only the first flag per kind and truncates long evidence", () => {
    const long = "a".repeat(300);
    const flags = parseNoteFlags(
      `[{"i": 0, "kind": "feature_blocker", "evidence": "${long}"}, {"i": 1, "kind": "feature_blocker", "evidence": "second"}]`,
      engagements
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].evidence).toHaveLength(140);
    expect(flags[0].engagementTitle).toBe("Check-in call");
  });

  it("strips surrounding prose around the JSON array", () => {
    const flags = parseNoteFlags(
      'Here you go:\n```json\n[{"i": 1, "kind": "expansion_interest", "evidence": "wants a second location"}]\n```',
      engagements
    );
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe("expansion_interest");
  });
});

describe("noteFlagsToSignals", () => {
  it("maps churn risk to bad severity and others to warn, with evidence in detail", () => {
    const signals = noteFlagsToSignals([
      {
        kind: "churn_risk_mentioned",
        evidence: "thinking about cancelling",
        engagementDate: "2026-07-28T10:00:00.000Z",
        engagementTitle: "Call",
      },
      {
        kind: "expansion_interest",
        evidence: "wants Bloom too",
        engagementDate: "2026-07-10T10:00:00.000Z",
        engagementTitle: "Meeting",
      },
    ]);
    expect(signals[0]).toMatchObject({
      kind: "churn_risk_mentioned",
      severity: "bad",
      title: "Churn risk mentioned",
    });
    expect(signals[0].detail).toContain("thinking about cancelling");
    expect(signals[0].detail).toContain("Jul 28");
    expect(signals[1].severity).toBe("warn");
  });
});
