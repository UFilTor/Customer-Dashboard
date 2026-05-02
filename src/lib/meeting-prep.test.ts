import { describe, it, expect } from "vitest";
import {
  isLifecycleScope,
  isMeetingPrepPipeline,
  isRetentionScope,
} from "./meeting-prep";

describe("isMeetingPrepPipeline", () => {
  it("matches both lifecycle and retention pipelines", () => {
    expect(isMeetingPrepPipeline("166333631")).toBe(true);
    expect(isMeetingPrepPipeline("1072518362")).toBe(true);
  });
  it("rejects unrelated pipelines", () => {
    expect(isMeetingPrepPipeline("81267902")).toBe(false);
    expect(isMeetingPrepPipeline(undefined)).toBe(false);
    expect(isMeetingPrepPipeline("")).toBe(false);
  });
});

describe("isLifecycleScope", () => {
  it("matches active onboarding stages on the lifecycle pipeline", () => {
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Onboarding" })).toBe(true);
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Adopted" })).toBe(true);
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Started" })).toBe(true);
  });
  it("rejects non-onboarding stages on the lifecycle pipeline", () => {
    expect(isLifecycleScope({ pipeline: "166333631", customer_stage: "Established" })).toBe(false);
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
