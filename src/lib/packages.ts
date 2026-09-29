// "Package" = the plan, recurring add-ons and one-off fees a customer has.
// Source of truth is the OPEN LIFECYCLE DEAL's own properties: the quote
// workflow stamps them from the signed quote, Expansion Closed Won copies
// add-on sales onto it, and churn zeroes an add-on's ARR. So `{p}_arr__eur >
// 0` means "has it now", which is why no line-item access is needed. Full
// property map: docs/hubspot-data-map.md.
//
// Email Marketing and Studio are left out on purpose: HubSpot has no price,
// status or ARR property for either (Email Marketing only exists as an
// `expansion_products` value, which is never cleared on churn).

export type PackageProductKey = "website" | "meta_ads" | "google_ads" | "reviews" | "accounting";
export type PackageItemKind = "plan" | "addon" | "one_off";
export type PackageBilling = "monthly" | "annual" | "one_off";

export interface PackageItem {
  /** "plan", a PackageProductKey, or "launch_package" / "website_launch". */
  key: string;
  kind: PackageItemKind;
  /** Display label, e.g. "Understory Starter", "Website", "Launch Package". */
  label: string;
  /** Tier ("Starter", "Branded + Smart"), or null. */
  tier: string | null;
  billing: PackageBilling;
  /** Price in minor units (öre / cents) for one billing period, or null. */
  amountMinor: number | null;
  currency: string | null;
}

export interface CompanyPackage {
  /** "unknown" = the lifecycle deal carries no plan, add-on or one-off. */
  status: "known" | "unknown";
  plan: PackageItem | null;
  /** Bare plan name ("Starter"), for compact labels; null with no plan. */
  planName: string | null;
  addOns: PackageItem[];
  oneOffs: PackageItem[];
  /** `date_of_contract_signed` on the lifecycle deal. */
  signedAt: string | null;
}

interface AddOnSpec {
  key: PackageProductKey;
  label: string;
  /** EUR ARR property; > 0 means the customer has the add-on now. */
  arrEur: string;
  /** Contracted price, local currency, per billing period. Tried in order. */
  price: string[];
  tier?: string;
  /** Billing-schedule property (Monthly / Yearly); absent = monthly. */
  schedule?: string;
}

const ADD_ONS: AddOnSpec[] = [
  { key: "website", label: "Website", arrEur: "websites_arr__eur", price: ["websites_full_price__local_currency"], tier: "websites_tier", schedule: "websites_billing_schedule" },
  // Internal names keep the retired `bloom_` prefix; the product is Meta ads.
  { key: "meta_ads", label: "Meta ads", arrEur: "bloom_arr__eur", price: ["bloom_full_price__local_currency", "bloom_full_price"] },
  { key: "google_ads", label: "Google Ads", arrEur: "google_ads_arr__eur", price: ["google_ads_full_price__local_currency"], tier: "google_ads_tier", schedule: "google_ads_billing_schedule" },
  { key: "reviews", label: "Reviews", arrEur: "reviews_arr__eur", price: ["reviews_full_price__local_currency"] },
  { key: "accounting", label: "Accounting", arrEur: "accounting_arr__eur", price: ["accounting_full_price__local_currency"], schedule: "accounting_billing_schedule" },
];

const ONE_OFFS = [
  { key: "launch_package", label: "Launch Package", price: "implementation_fee__local_currency" },
  { key: "website_launch", label: "Website Launch", price: "websites_launch__local_currency" },
];

/** Every deal property buildPackageFromDeal reads. Add to each lifecycle-deal fetch. */
export const PACKAGE_DEAL_PROPS: string[] = Array.from(
  new Set([
    "subscription_plan",
    "product_tier",
    "billing_schedule",
    "core_net_price__local_currency",
    "deal_currency_code",
    "date_of_contract_signed",
    ...ADD_ONS.flatMap((a) => [a.arrEur, ...a.price, ...(a.tier ? [a.tier] : []), ...(a.schedule ? [a.schedule] : [])]),
    ...ONE_OFFS.map((o) => o.price),
  ])
);

/** Filter options for the Portfolio "Products" dropdown, in display order. */
export const PACKAGE_FILTER_PRODUCTS: Array<{ key: PackageProductKey; label: string }> = ADD_ONS.map((a) => ({
  key: a.key,
  label: a.label,
}));

/** HubSpot money string -> integer minor units, or null. */
export function toMinor(v: string | undefined | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

function billingOf(schedule: string | undefined): PackageBilling {
  return /year/i.test(schedule || "") ? "annual" : "monthly";
}

function blankToNull(v: string | undefined): string | null {
  const t = (v || "").trim();
  return t === "" ? null : t;
}

/**
 * Pure: build a package from one lifecycle deal's properties.
 * - Plan = `subscription_plan` ("Current pricing plan"), falling back to
 *   `product_tier`. "Churned" means no current plan. Price = Booking net price
 *   (the yearly total when `billing_schedule` is Yearly).
 * - Add-on included when its EUR ARR > 0 (0 on churn, and set even when the
 *   add-on was sold on the original sales deal, where `{p}_status` can be blank).
 * - One-off included when its fee > 0 (0 = none or waived).
 * Missing properties (older cached payloads) just yield fewer items.
 */
export function buildPackageFromDeal(p: Record<string, string | null | undefined>): CompanyPackage {
  const get = (k: string) => p[k] ?? undefined;
  const currency = blankToNull(get("deal_currency_code"));

  const planName = blankToNull(get("subscription_plan")) ?? blankToNull(get("product_tier"));
  const plan: PackageItem | null =
    planName && planName.toLowerCase() !== "churned"
      ? {
          key: "plan",
          kind: "plan",
          label: `Understory ${planName}`,
          tier: null,
          billing: billingOf(get("billing_schedule")),
          amountMinor: toMinor(get("core_net_price__local_currency")),
          currency,
        }
      : null;

  const addOns: PackageItem[] = [];
  for (const a of ADD_ONS) {
    const arr = Number(get(a.arrEur));
    if (!Number.isFinite(arr) || arr <= 0) continue;
    const priceRaw = a.price.map((k) => get(k)).find((v) => blankToNull(v) != null);
    const tierRaw = a.tier ? blankToNull(get(a.tier)) : null;
    addOns.push({
      key: a.key,
      kind: "addon",
      label: a.label,
      // google_ads_tier is multi-checkbox ("Branded;Smart").
      tier: tierRaw ? tierRaw.split(";").map((s) => s.trim()).filter(Boolean).join(" + ") : null,
      billing: billingOf(a.schedule ? get(a.schedule) : undefined),
      amountMinor: toMinor(priceRaw),
      currency,
    });
  }

  const oneOffs: PackageItem[] = [];
  for (const o of ONE_OFFS) {
    const amountMinor = toMinor(get(o.price));
    if (amountMinor == null || amountMinor <= 0) continue;
    oneOffs.push({ key: o.key, kind: "one_off", label: o.label, tier: null, billing: "one_off", amountMinor, currency });
  }

  const known = plan !== null || addOns.length > 0 || oneOffs.length > 0;
  return {
    status: known ? "known" : "unknown",
    plan,
    planName: plan ? planName : null,
    addOns,
    oneOffs,
    signedAt: blankToNull(get("date_of_contract_signed")),
  };
}

/** Add-ons and one-offs as display lines, for the Portfolio Package tooltip. */
export function packageExtraLines(pkg: CompanyPackage | null | undefined): string[] {
  if (!pkg) return [];
  return [
    ...pkg.addOns.map(packageItemName),
    ...pkg.oneOffs.map((o) => `${packageItemName(o)} (one-off)`),
  ];
}

/**
 * Portfolio pill text: the plan name alone, or "Starter +2" where 2 is the
 * number of add-ons / one-offs listed on hover. No plan: "+2", or "—".
 */
export function packagePillText(plan: string | null, extraCount: number): string {
  const extra = extraCount > 0 ? `+${extraCount}` : "";
  if (plan) return extra ? `${plan} ${extra}` : plan;
  return extra || "—";
}

/** Add-on keys a package includes, for the Portfolio filter. */
export function packageProductKeys(pkg: CompanyPackage | null | undefined): string[] {
  return pkg ? pkg.addOns.map((a) => a.key) : [];
}

/** "799 SEK/mo", "4,788 SEK/yr", "99 SEK one-off", or null when unpriced. */
export function formatPackagePrice(item: PackageItem): string | null {
  if (item.amountMinor == null) return null;
  const major = item.amountMinor / 100;
  const num = major.toLocaleString("en-GB", {
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const cur = item.currency ? ` ${item.currency}` : "";
  const suffix = item.billing === "monthly" ? "/mo" : item.billing === "annual" ? "/yr" : " one-off";
  return `${num}${cur}${suffix}`;
}

/** Display name incl. tier: "Website Starter", "Google Ads Branded + Smart". */
export function packageItemName(item: PackageItem): string {
  return item.tier ? `${item.label} ${item.tier}` : item.label;
}
