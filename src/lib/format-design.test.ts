import { describe, it, expect } from "vitest";
import { fmtHealth, splitLinks } from "./format-design";

describe("fmtHealth", () => {
  it("reads a whole-number score of 1 as 1, not as a 100% ratio", () => {
    expect(fmtHealth(1)).toEqual({ label: "Weak", num: 1, tone: "bad" });
    expect(fmtHealth("1")).toEqual({ label: "Weak", num: 1, tone: "bad" });
  });

  it("reads 0 and ordinary 0-100 scores as they are", () => {
    expect(fmtHealth(0)).toEqual({ label: "Weak", num: 0, tone: "bad" });
    expect(fmtHealth("55")).toEqual({ label: "At risk", num: 55, tone: "warn" });
    expect(fmtHealth(100)).toEqual({ label: "Strong", num: 100, tone: "good" });
  });

  it("still scales legacy fractional ratios to 0-100", () => {
    expect(fmtHealth(0.45)).toEqual({ label: "At risk", num: 45, tone: "warn" });
    expect(fmtHealth("0.9")).toEqual({ label: "Strong", num: 90, tone: "good" });
  });

  it("shows a dash for a blank or unparseable score", () => {
    expect(fmtHealth(null).num).toBeNull();
    expect(fmtHealth("").num).toBeNull();
    expect(fmtHealth("abc").num).toBeNull();
  });
});

describe("splitLinks", () => {
  it("makes each URL its own link and keeps prose as plain text", () => {
    expect(splitLinks("https://a.com/x\n\nTwo sites: see https://b.com/#y (open booking)")).toEqual([
      { kind: "link", text: "https://a.com/x", href: "https://a.com/x" },
      { kind: "text", text: "\n\nTwo sites: see " },
      { kind: "link", text: "https://b.com/#y", href: "https://b.com/#y" },
      { kind: "text", text: " (open booking)" },
    ]);
  });

  it("splits URLs joined by '+' or a list dash", () => {
    const links = splitLinks("https://a.se/one/ + https://a.se/two/\n-https://a.se/three/")
      .filter((s) => s.kind === "link")
      .map((s) => s.text);
    expect(links).toEqual(["https://a.se/one/", "https://a.se/two/", "https://a.se/three/"]);
  });

  it("leaves trailing sentence punctuation out of the link", () => {
    expect(splitLinks("Book at https://x.se/:")).toEqual([
      { kind: "text", text: "Book at " },
      { kind: "link", text: "https://x.se/", href: "https://x.se/" },
      { kind: "text", text: ":" },
    ]);
    expect(splitLinks("(https://x.se/tours).")[1]).toEqual({
      kind: "link",
      text: "https://x.se/tours",
      href: "https://x.se/tours",
    });
  });

  it("links a bare www. address with an https scheme", () => {
    expect(splitLinks("www.nosito.com")).toEqual([
      { kind: "link", text: "www.nosito.com", href: "https://www.nosito.com" },
    ]);
  });

  it("returns plain text when there is no URL", () => {
    expect(splitLinks("They will send over a document")).toEqual([
      { kind: "text", text: "They will send over a document" },
    ]);
  });
});
