import { describe, it, expect } from "vitest";
import {
  buildPackageFromDeal,
  formatPackagePrice,
  packageItemName,
  packageProductKeys,
  PACKAGE_DEAL_PROPS,
  toMinor,
} from "./packages";

// Segelbåten April's lifecycle deal, as read live on 2026-09-29.
const segelbaten = {
  subscription_plan: "Starter",
  product_tier: "Starter",
  billing_schedule: "Monthly",
  core_net_price__local_currency: "359",
  deal_currency_code: "SEK",
  implementation_fee__local_currency: "99",
  websites_arr__eur: "867.512652",
  websites_full_price__local_currency: "799",
  websites_tier: "Starter",
  websites_billing_schedule: "Monthly",
  websites_launch__local_currency: "0",
  bloom_arr__eur: "0.000000",
  google_ads_arr__eur: "0.000000",
  reviews_arr__eur: "0.000000",
  accounting_arr__eur: "0.000000",
};

describe("buildPackageFromDeal", () => {
  it("builds Segelbåten: Starter plan, Website Starter, Launch Package", () => {
    const pkg = buildPackageFromDeal(segelbaten);
    expect(pkg.status).toBe("known");
    expect(pkg.plan && packageItemName(pkg.plan)).toBe("Understory Starter");
    expect(pkg.addOns.map(packageItemName)).toEqual(["Website Starter"]);
    expect(pkg.oneOffs.map((o) => o.label)).toEqual(["Launch Package"]);
    expect(packageProductKeys(pkg)).toEqual(["website"]);
    expect(formatPackagePrice(pkg.addOns[0])).toBe("799 SEK/mo");
    expect(formatPackagePrice(pkg.oneOffs[0])).toBe("99 SEK one-off");
  });

  it("drops an add-on whose ARR went to 0 on churn, even with a price left on the deal", () => {
    const pkg = buildPackageFromDeal({ ...segelbaten, websites_arr__eur: "0" });
    expect(pkg.addOns).toEqual([]);
  });

  it("falls back to product_tier and treats a Churned plan as no plan", () => {
    expect(buildPackageFromDeal({ product_tier: "Growth" }).plan?.label).toBe("Understory Growth");
    expect(buildPackageFromDeal({ subscription_plan: "Churned", product_tier: "Growth" }).plan).toBeNull();
  });

  it("joins multi-checkbox tiers and reads yearly billing", () => {
    const pkg = buildPackageFromDeal({
      google_ads_arr__eur: "1068",
      google_ads_tier: "Branded;Smart",
      google_ads_billing_schedule: "Yearly",
      google_ads_full_price__local_currency: "2736",
      deal_currency_code: "EUR",
    });
    expect(packageItemName(pkg.addOns[0])).toBe("Google Ads Branded + Smart");
    expect(formatPackagePrice(pkg.addOns[0])).toBe("2,736 EUR/yr");
  });

  it("tries the second Meta ads price property when the first is blank", () => {
    const pkg = buildPackageFromDeal({ bloom_arr__eur: "4188", bloom_full_price: "349" });
    expect(pkg.addOns[0].label).toBe("Meta ads");
    expect(pkg.addOns[0].amountMinor).toBe(34900);
  });

  it("is unknown for an empty or pre-deploy deal, and tolerates null values", () => {
    expect(buildPackageFromDeal({}).status).toBe("unknown");
    expect(buildPackageFromDeal({ subscription_plan: null, websites_arr__eur: undefined }).status).toBe("unknown");
    expect(packageProductKeys(undefined)).toEqual([]);
  });

  it("requests every property it reads", () => {
    for (const k of Object.keys(segelbaten)) expect(PACKAGE_DEAL_PROPS).toContain(k);
  });
});

describe("toMinor", () => {
  it("converts to integer minor units and rejects junk", () => {
    expect(toMinor("799")).toBe(79900);
    expect(toMinor("359.5")).toBe(35950);
    expect(toMinor("")).toBeNull();
    expect(toMinor(undefined)).toBeNull();
    expect(toMinor("abc")).toBeNull();
  });
});
