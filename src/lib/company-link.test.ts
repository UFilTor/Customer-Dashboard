import { describe, expect, it, beforeEach } from "vitest";
import { companyHref, isNewTabClick } from "./company-link";

function setSearch(search: string): void {
  window.history.replaceState({}, "", `/${search}`);
}

describe("companyHref", () => {
  beforeEach(() => setSearch(""));

  it("adds c to an empty query string", () => {
    expect(companyHref("123")).toBe("/?c=123");
  });

  it("preserves every other view param", () => {
    setSearch("?d=meeting_prep&f=person&fv=962517007&pv=board&q=fly");
    const href = companyHref("456");
    const sp = new URLSearchParams(href.slice(href.indexOf("?")));
    expect(sp.get("d")).toBe("meeting_prep");
    expect(sp.get("f")).toBe("person");
    expect(sp.get("fv")).toBe("962517007");
    expect(sp.get("pv")).toBe("board");
    expect(sp.get("q")).toBe("fly");
    expect(sp.get("c")).toBe("456");
  });

  it("overwrites an existing c instead of appending a second one", () => {
    setSearch("?pv=board&c=111");
    const href = companyHref("222");
    const sp = new URLSearchParams(href.slice(href.indexOf("?")));
    expect(sp.getAll("c")).toEqual(["222"]);
    expect(sp.get("pv")).toBe("board");
  });

  it("keeps the current pathname", () => {
    window.history.replaceState({}, "", "/?pv=board");
    expect(companyHref("789").startsWith("/?")).toBe(true);
  });
});

describe("isNewTabClick", () => {
  const base = { button: 0, metaKey: false, ctrlKey: false };

  it("is true for a middle click", () => {
    expect(isNewTabClick({ ...base, button: 1 })).toBe(true);
  });

  it("is true for cmd-click and ctrl-click", () => {
    expect(isNewTabClick({ ...base, metaKey: true })).toBe(true);
    expect(isNewTabClick({ ...base, ctrlKey: true })).toBe(true);
  });

  it("is false for a plain left click", () => {
    expect(isNewTabClick(base)).toBe(false);
  });

  it("is false for a right click with no modifier", () => {
    expect(isNewTabClick({ ...base, button: 2 })).toBe(false);
  });

  it("ignores shift, which the browser owns (new window)", () => {
    // shiftKey isn't part of the input shape at all — a shift-click arrives as
    // a plain left click here and opens in place.
    expect(isNewTabClick(base)).toBe(false);
  });
});
