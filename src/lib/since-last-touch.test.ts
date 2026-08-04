import { describe, expect, it } from "vitest";
import { buildSinceLastTouch, computeSinceLastTouch } from "./since-last-touch";

const NOW = "2026-08-03T12:00:00.000Z";
const TOUCH = "2026-07-20T10:00:00.000Z";

describe("computeSinceLastTouch", () => {
  it("emits a change when a value moved after the touch", () => {
    const changes = computeSinceLastTouch(
      {
        health_score: [
          { value: "58.2", timestamp: "2026-07-28T00:00:00.000Z" },
          { value: "72.0", timestamp: "2026-07-01T00:00:00.000Z" },
        ],
      },
      TOUCH,
      NOW
    );
    expect(changes).toEqual([
      {
        field: "health_score",
        label: "Health score",
        from: "72",
        to: "58",
        timestamp: "2026-07-28T00:00:00.000Z",
      },
    ]);
  });

  it("ignores changes that happened before the touch", () => {
    const changes = computeSinceLastTouch(
      {
        customer_stage: [
          { value: "Adopted", timestamp: "2026-07-10T00:00:00.000Z" },
          { value: "Started", timestamp: "2026-06-01T00:00:00.000Z" },
        ],
      },
      TOUCH,
      NOW
    );
    expect(changes).toEqual([]);
  });

  it("returns empty when there is no last touch", () => {
    const changes = computeSinceLastTouch(
      { health_score: [{ value: "50", timestamp: "2026-07-28T00:00:00.000Z" }] },
      null,
      NOW
    );
    expect(changes).toEqual([]);
  });

  it("skips identical re-saves of the same value", () => {
    const changes = computeSinceLastTouch(
      {
        customer_stage: [
          { value: "Adopted", timestamp: "2026-07-28T00:00:00.000Z" },
          { value: "Adopted", timestamp: "2026-07-01T00:00:00.000Z" },
        ],
      },
      TOUCH,
      NOW
    );
    expect(changes).toEqual([]);
  });

  it("emits with null `from` when history does not reach back to the touch", () => {
    const changes = computeSinceLastTouch(
      {
        health_score: [{ value: "41", timestamp: "2026-07-30T00:00:00.000Z" }],
      },
      TOUCH,
      NOW
    );
    expect(changes).toHaveLength(1);
    expect(changes[0].from).toBeNull();
    expect(changes[0].to).toBe("41");
  });

  it("caps the lookback window even when the touch is ancient", () => {
    const changes = computeSinceLastTouch(
      {
        health_score: [
          // 90 days before NOW — outside the 60-day cap
          { value: "30", timestamp: "2026-05-05T00:00:00.000Z" },
          { value: "80", timestamp: "2026-04-01T00:00:00.000Z" },
        ],
      },
      "2026-01-01T00:00:00.000Z",
      NOW
    );
    expect(changes).toEqual([]);
  });

  it("ignores future-dated history entries", () => {
    const changes = computeSinceLastTouch(
      {
        health_score: [{ value: "10", timestamp: "2026-09-01T00:00:00.000Z" }],
      },
      TOUCH,
      NOW
    );
    expect(changes).toEqual([]);
  });

  it("sorts multiple changes newest first", () => {
    const changes = computeSinceLastTouch(
      {
        health_score: [
          { value: "40", timestamp: "2026-07-25T00:00:00.000Z" },
          { value: "70", timestamp: "2026-07-01T00:00:00.000Z" },
        ],
        customer_stage: [
          { value: "Ramp Up", timestamp: "2026-07-30T00:00:00.000Z" },
          { value: "Adopted", timestamp: "2026-07-01T00:00:00.000Z" },
        ],
      },
      TOUCH,
      NOW
    );
    expect(changes.map((c) => c.field)).toEqual(["customer_stage", "health_score"]);
  });
});

describe("buildSinceLastTouch", () => {
  it("returns null without a last touch", () => {
    expect(buildSinceLastTouch({}, {}, null, NOW)).toBeNull();
  });

  it("merges company and deal histories and computes days since touch", () => {
    const result = buildSinceLastTouch(
      { health_score: [{ value: "44", timestamp: "2026-07-28T00:00:00.000Z" }, { value: "60", timestamp: "2026-07-02T00:00:00.000Z" }] },
      { customer_stage: [{ value: "Ramp Up", timestamp: "2026-07-29T00:00:00.000Z" }, { value: "Adopted", timestamp: "2026-06-20T00:00:00.000Z" }] },
      TOUCH,
      NOW
    );
    expect(result).not.toBeNull();
    expect(result!.daysSinceTouch).toBe(14);
    expect(result!.changes.map((c) => c.field)).toEqual([
      "customer_stage",
      "health_score",
    ]);
  });
});
