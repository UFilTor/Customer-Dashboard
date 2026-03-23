import { describe, it, expect, vi, beforeEach } from "vitest";
import { Cache } from "@/lib/cache";

describe("Cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns cached value within TTL", () => {
    const cache = new Cache<string>(5 * 60 * 1000);
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns null after TTL expires", () => {
    const cache = new Cache<string>(5 * 60 * 1000);
    cache.set("key1", "value1");
    vi.advanceTimersByTime(6 * 60 * 1000);
    expect(cache.get("key1")).toBeNull();
  });

  it("returns null for missing keys", () => {
    const cache = new Cache<string>(5 * 60 * 1000);
    expect(cache.get("missing")).toBeNull();
  });

  it("supports different TTLs", () => {
    const cache = new Cache<string>(1000);
    cache.set("key1", "value1");
    vi.advanceTimersByTime(1500);
    expect(cache.get("key1")).toBeNull();
  });
});
