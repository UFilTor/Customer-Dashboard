import { describe, it, expect } from "vitest";
import { whatsappNumber, whatsappUrl } from "./phone";

describe("whatsappNumber", () => {
  it("strips formatting from international numbers", () => {
    expect(whatsappNumber("+46 73 386 75 27", "SE")).toBe("46733867527");
    expect(whatsappNumber("+45 20 21 88 81", "DK")).toBe("4520218881");
    expect(whatsappNumber("+44 7568 478932", "GB")).toBe("447568478932");
  });

  it("trusts the number's own country code over the company's", () => {
    // Danish company, Italian contact number - the + wins.
    expect(whatsappNumber("+393408586065", "DK")).toBe("393408586065");
  });

  it("handles the 00 international prefix", () => {
    expect(whatsappNumber("004531310777", "DK")).toBe("4531310777");
  });

  it("prefixes national numbers with the company's dialling code", () => {
    expect(whatsappNumber("29650141", "DK")).toBe("4529650141");
    expect(whatsappNumber("95405092", "NO")).toBe("4795405092");
    expect(whatsappNumber("56 59 81", "GL")).toBe("299565981");
  });

  it("drops the trunk 0 only where the country uses one", () => {
    expect(whatsappNumber("0764494133", "SE")).toBe("46764494133");
    expect(whatsappNumber("07568 478932", "GB")).toBe("447568478932");
    // Italy keeps its leading 0 on landlines.
    expect(whatsappNumber("030 9589084", "IT")).toBe("390309589084");
  });

  it("does not double-prefix a number stored with its country code but no +", () => {
    expect(whatsappNumber("46701234567", "SE")).toBe("46701234567");
    // Swedish national number in an area code that starts with the dialling
    // code (046 = Lund) is still treated as national.
    expect(whatsappNumber("046123456", "SE")).toBe("4646123456");
  });

  it("covers the countries outside the seven in hubspot-enums COUNTRY_CODES", () => {
    expect(whatsappNumber("612345678", "NL")).toBe("31612345678");
    expect(whatsappNumber("612345678", "ES")).toBe("34612345678");
    expect(whatsappNumber("045 7312345", "FI")).toBe("358457312345");
  });

  it("returns null for national numbers with no country to anchor them", () => {
    expect(whatsappNumber("29650141", null)).toBeNull();
    expect(whatsappNumber("29650141", "")).toBeNull();
    // Country outside our dialling-code map.
    expect(whatsappNumber("29650141", "JP")).toBeNull();
  });

  it("returns null for empty, missing, or implausible input", () => {
    expect(whatsappNumber(null, "SE")).toBeNull();
    expect(whatsappNumber(undefined, "SE")).toBeNull();
    expect(whatsappNumber("   ", "SE")).toBeNull();
    expect(whatsappNumber("n/a", "SE")).toBeNull();
    // Too short to be a real number even with a country code.
    expect(whatsappNumber("+45 12 34", "DK")).toBeNull();
    // Too long for E.164.
    expect(whatsappNumber("+46 70123456789012", "SE")).toBeNull();
  });
});

describe("whatsappUrl", () => {
  it("builds the send link with an empty prefilled message", () => {
    expect(whatsappUrl("+46 73 386 75 27", "SE")).toBe(
      "https://api.whatsapp.com/send?phone=46733867527&text="
    );
  });

  it("is null when the number cannot be normalized", () => {
    expect(whatsappUrl("29650141", null)).toBeNull();
    expect(whatsappUrl(null, "SE")).toBeNull();
  });
});
