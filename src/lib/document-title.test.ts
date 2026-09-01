import { describe, expect, it } from "vitest";
import { APP_TITLE, documentTitle } from "./document-title";

describe("documentTitle", () => {
  it("names the open company when one is loaded", () => {
    expect(
      documentTitle({ companyName: "Fox&Cubs", dashboardLabel: "Portfolio", subview: "Board" })
    ).toBe("Fox&Cubs");
  });

  it("falls back to the view while the detail is still loading", () => {
    expect(
      documentTitle({ companyName: null, dashboardLabel: "Portfolio", subview: "Board" })
    ).toBe("Portfolio - Board");
  });

  it("treats a blank or whitespace company name as absent", () => {
    expect(documentTitle({ companyName: "   ", dashboardLabel: "Lookup" })).toBe("Lookup");
  });

  it("omits the separator when there is no subview", () => {
    expect(documentTitle({ dashboardLabel: "Meeting prep" })).toBe("Meeting prep");
    expect(documentTitle({ dashboardLabel: "Meeting prep", subview: null })).toBe("Meeting prep");
  });

  it("falls back to the app title when the dashboard label is missing", () => {
    // Guards the DASHBOARDS lookup missing a key (e.g. Bloom, not yet wired).
    expect(documentTitle({})).toBe(APP_TITLE);
    expect(documentTitle({ dashboardLabel: undefined, subview: "Board" })).toBe(APP_TITLE);
  });

  it("clamps an absurdly long company name", () => {
    const title = documentTitle({ companyName: "A".repeat(200) });
    expect(title.length).toBe(70);
    expect(title.endsWith("…")).toBe(true);
  });

  it("leaves a normal-length name untouched", () => {
    const name = "Båten ISA af Lygnern Ek För";
    expect(documentTitle({ companyName: name })).toBe(name);
  });
});
