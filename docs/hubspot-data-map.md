# HubSpot data map

Where Understory's commercial data lives in HubSpot (portal 26131226), for building dashboard features. Distilled from the RevOps Notion docs (list at the bottom) on 2026-09-29 and spot-checked against live deals. All of it is readable with the dashboard's existing private-app token: companies, contacts, deals and engagements. Nothing here needs the line items, products, quotes or subscriptions scopes.

**The one rule to remember:** a customer's current package lives as **properties on the open lifecycle deal** (`is_open_lifecycle_deal = 1`). Sales and expansion deals are sale events; workflows copy what they sold onto the lifecycle deal. There is **no company-level rollup** of plan or add-ons (the company only holds interest signals).

## Pipelines

| Pipeline | ID | Role |
|---|---|---|
| Sales (New Business) | `81267902` | The original sale. Quote workflow stamps deal properties from quote line items. |
| Customer Lifecycle | `166333631` | One open deal per customer; carries the live package. `customer_stage` drives onboarding stages. |
| Retention | `1072518362` | Live customers (see `src/lib/meeting-prep.ts`). |
| Expansion | `3687958771` | Add-on sales after signup. |

Sales stages: Demo booked `624991450` · Demo completed `190366179` · Contract sent `563599067` · Closed won `190366181` · Closed lost `190366182`.
Churned stages: Lifecycle `645533646` · Retention `1692266738` · Partner pipeline `2257116370`. Onboarding and Retention share one lifecycle deal.
Stage entry dates live in `hs_v2_date_entered_<stageId>`.

Expansion stages (no skipping, no moving back):

| Stage | ID | Probability |
|---|---|---|
| Upsell Potential | `5866022117` | 10% |
| Interest Identified (default) | `5112925389` | 20% |
| In Conversation | `5112925390` | 30% |
| Contract Sent | `5112925393` | 80% |
| Closed Won | `5112925394` | 100% |
| Closed Lost | `5112925395` | 0% |

- `hs_v2_date_entered_5866022117` set = the deal started as proactive outbound (permanent marker).
- Closed Won requires `expansion_deal_currency_matches_lifecycle_deal_currency`, `expansion_products`, `date_of_contract_signed`, `expansion_price_information`.
- Expansion deal ↔ lifecycle deal: association type **40** (USER_DEFINED, labels "Open Lifecycle Deal" / "Lifecycle deal (Expansion)"), set by flow 4062783694.
- Self-serve expansion: Deal Channel = `Product Deal`, Deal Type = `Expansion Deal`.

## How a sale becomes deal properties

1. The rep adds line items to the **quote**. HubSpot copies the deal's line items onto the quote at creation, and after that the two sets are independent (which is why line items look duplicated on a deal).
2. When the quote reaches Pending Approval or Signed, the custom-code workflow **"New Quote Triggering Deal Properties"** reads the quote's line items and stamps deal properties. Node 11 handles products, node 12 handles `plan_version`, `legal_entity` and `quote_checks_passed`.
3. At Closed Won, `core_arr` is stamped, flow 1129604824 creates the lifecycle deal, and properties are copied onto it.
4. For an expansion deal, flow 4062784749 "Expansion Closed Won" sets `{product}_status = Signed` on both deals (it never downgrades a status) and copies price, dates and months to the lifecycle deal.
5. Flow 4556430523 "Update ARR on Products" keeps each product's free ARR property equal to its calculated one on open deals, unless `exception_to_arr_calculation` is ticked for that product.
6. The monthly tick-down (`tickdown_v8`, flow 4096059598, 1st of the month) recalculates the months left.

The line-item-name → product routing (`PRODUCT_MAP`) matches the lowercased name with `includes`, and the first match wins: `implementation`/`launch package` → Launch Package; `bloom`/`meta ads` → Meta ads; `understory` → Core; `accounting`; `reviews`; `google ads`; `website launch` (checked before `websites`); `websites`. The Core tier comes from the same name via `tierMap` (starter / growth / enterprise / explore→Explorer). A product is annual when its name contains "annual".

## Package properties (on the lifecycle deal)

### Core plan

| Property | Meaning |
|---|---|
| `subscription_plan` | "Current pricing plan", the plan the customer is on now: `Free` / `Essential` / `Advanced` / `Starter` / `Growth` / `Enterprise` / `Partner` / `Custom` / `Churned` / `Explorer`. Kept up to date by the "Current Pricing Plan" workflow. **Use this for "which plan"**. (The company-level `pricing_plan` is empty on current customers, so don't use it.) |
| `product_tier` | Core plan: `Explorer` / `Starter` / `Growth` / `Enterprise`. Set from the Core line item name. Explorer deals quoted before 1 Sep 2026 may be blank. |
| `plan_version` | Price list: `2025_10` ("2025 - Oct") / `2026_09` ("2026 - Sep"). Resolved from the quote template name, and closed deals were backfilled to `2025_10`. Expansion deals are never versioned. |
| `billing_schedule` | Core billing, `Monthly` / `Yearly`. |
| `core_net_price__local_currency` | Contracted Core price (the yearly total on annual deals). |
| `core_mrr__local_currency` | Net price ÷ 12 when Yearly, otherwise the net price. |
| `core_arr` / `core_arr__euro` | Core ARR (free, canonical property) and its EUR value. |
| `confirmed_booking_fee` | Booking fee as a decimal (0.04 = 4%). |

### Add-ons

Every add-on follows the pattern `{p}_status`, `{p}_full_price__local_currency`, `{p}_full_period_months`, `{p}_close_date`, `{p}_churn_date`, `{p}_billing_start_date`, `{p}_arr__eur`.

| Product | Prefix `{p}` | Tier / schedule | Free ARR property (canonical) | Status is set by |
|---|---|---|---|---|
| Website | `websites` | `websites_tier` (Starter/Premium/Ultimate), `websites_billing_schedule` | `websites_arr__local_currency` | Signed at Closed Won, then CS by hand |
| Meta ads | `bloom` (retired internal name, kept by HubSpot) | intro/full price + months | `bloom_arr__local_currency` | Workflows plus product sync (4523425008) |
| Google Ads | `google_ads` | `google_ads_tier` (multi: Branded/Smart), `google_ads_billing_schedule` | `google_ads_arr__local_currency` | Workflow (product events since 22 Sep) |
| Reviews | `reviews` | Premium only | `reviews_arr__local_currency` | Workflow 4847309007 |
| Accounting | `accounting` | `accounting_billing_schedule` | `accounting_arr__local_currency_manual` (reversed: here `_manual` is the free one) | Workflow 4898995389 (no Paused status) |
| Email Marketing, Studio | none | none | none | Exists only as an `expansion_products` value |

Status values: `Signed` / `Implementation` / `Live` / `Paused` / `Churned`. Meta ads adds `Awaiting Core finalization` and `Ready for Bloom onboarding` (label "Awaiting Meta Ads onboarding"). A Core churn (flow 4561080510) sets every sold add-on to Churned, its months to 0 and its free ARR to 0.

### One-off fees (outside ARR)

| Property | Meaning |
|---|---|
| `implementation_fee__local_currency` | Launch Package, net (0 = none or waived). The internal name still says "implementation". |
| `implementation_fee_list__local_currency` | Launch Package list price (> 0 means it was quoted). |
| `launch_package__eur` | Launch Package in EUR. |
| `websites_launch__local_currency` / `websites_launch__eur` | Website Launch (Ultimate set-up). |
| `websites_expert_rate__local_currency` | Website expert hourly rate. |

### Totals and helpers

- `calculated_amount` = `core_arr + transaction_fee_amount__local_currency + bloom_arr__local_currency + accounting_arr__local_currency_manual + reviews_arr__local_currency + google_ads_arr__local_currency + websites_arr__local_currency`. One-offs are excluded, and **one blank term makes the whole sum null**. `amount` follows it.
- `marketing_arr__eur` = Meta ads + Reviews + Websites + Google Ads, in EUR.
- `expansion_products` (multi-select: `Accounting`, `Bloom` = Meta ads, `Google Ads`, `Websites`, `Reviews`, `Email Marketing`). On the lifecycle deal it is the accumulated union of every add-on ever sold, so it tells you what was sold, **not what is active**.
- `exception_to_arr_calculation` + `arr_exception_reason`: a manual ARR override (admin-only).

### Reading "what does this customer have"

1. Find the company's open lifecycle deal (`is_open_lifecycle_deal = 1`).
2. **Plan** = `subscription_plan` (fallback `product_tier`), with `plan_version` and `billing_schedule`.
3. **Add-on included** = `{p}_arr__eur > 0`. This is the most reliable test: it goes to 0 on churn, and it's set even when the add-on was sold on the original sales deal. `{p}_status` can be blank in that case (verified on Segelbåten April: Website ARR 867.51 EUR, `websites_status` empty).
4. **Add-on state** = `{p}_status` when it's set.
5. **One-offs** = `implementation_fee__local_currency > 0` → Launch Package; `websites_launch__local_currency > 0` → Website Launch.
6. **Price shown to CS** = `{p}_full_price__local_currency` in `deal_currency_code`, per the tier's `*_billing_schedule`.

## Currency

- `deal_currency_code` is set by the rep from the quote. `hs_exchange_rate` is frozen at close, and every `*_eur` property = local × `hs_exchange_rate`.
- `amount_in_home_currency` is the EUR-normalised amount. Use it (never raw `amount`) when summing across currencies.
- Business volume is always EUR: `realized_business_volume_annual` (manual), `understory_live_business_volume_estimate` (data stream).

## Pricing (Sep 2026)

- `plan_version = 2026_09` also stamps `gift_card_rate_calculated` (booking fee + 0.02), `gift_card_rate`, `ota_integration_fee` (0.0175) and `invoice_payment_method_fee`. `2025_10` clears them. They are copied once to the lifecycle deal, after which Finance owns them.
- The legacy `- 2025` Core products and the `2025_10` value are due to be archived around 1 Oct 2026.
- EUR list prices: Core Starter annual 348 · Launch Package 299 · Meta ads 349/mo · Accounting 49/mo or 490/yr · Reviews Premium 39/mo · Google Ads Branded 89/mo, Smart 139/mo · Websites Starter 69 / Premium 199 / Ultimate 499 per month (annual = 12 × 0.9) · Website Launch 1,500.

## Customer flags, region, Pay, business volume

- `deal.is_open_lifecycle_deal` (0/1) marks an active customer. `company.number_of_open_lifecycle_deals` is the company rollup (1 = customer).
- `company.current_customer_segment`: the docs list Seed / Take off / Accelerate / Enterprise, but live data also has other values (Segelbåten April: `Corporate`). Fetch the enum live before filtering on it.
- `deal.deal_region`: `Denmark_plus` / `Sweden_plus` / `Italy_plus` / `Spain_plus` / `US` / `ROE` / `ROW`, derived from `deal_country` by workflow 4122497246.
- `deal.deal_adopted`, `deal.deal_adopted_date`.
- Understory Pay, company: `understory_pay_verification_status` (pending / awaiting_verification / verified), `understory_has_understory_pay_connected`, `understory_has_started_understory_pay_onboarding`, `understory_pay_live`, `understory_pay_unwilling` / `_ineligible` (+ `_reason`), each with a `_date`, and `payment_enabled`. A company workflow rolls these up into `understory_pay_status__customer` on the lifecycle deal. Deal inputs: `enable_understory_pay`, `transaction_fee_amount(__local_currency)`, `transaction_fee_rate`, `share_of_transactions_via_understory_pay`.
- Business volume (EUR): `realized_business_volume_annual`, `forecasted_business_volume__annual_____`, `business_volume_estimate__annual_____`, `understory_live_business_volume_estimate`.
- Integrity checks: `check__amount_vs_calculated_amount` (healthy = 0, mismatch list 4946), `understory_id_mismatch`. Flow 4656250052 self-heals Amount on lifecycle deals.
- Active Meta ads = `bloom_status = Live` AND `is_open_lifecycle_deal = 1`.

## Company-level signals (interest, not ownership)

- `understory_survey_product_type`: in-product interest (Google Ads, Website, Review, Email Marketing, Meta Ads, Dynamic Pricing, TikTok Ads, Snapchat Ads). Custom code maps it into `expansion_products`.
- `understory_has_open_accounting_subscription`: Accounting active or pending (canopy sync).
- `accounting_integration__waitlist`, list `7011`: the Accounting waitlist.
- `understory_company_id` (also on deals as `associated_company_understory_id`): the join key to Metabase.
- `understory_product_survey`: empty, do not use.

## Product-synced activity (raw signals, do not use alone)

`understory_{bloom|accounting|reviews|google_ads}_*` dates and flags (onboarding started / finalized / live / cancelled). Example: `understory_reviews_onboarding_finalized` is the only sign that Reviews Premium was paid for, but free Reviews users also carry `understory_reviews_disabled`.

## Sources

Distilled from the HubSpot Playbook wiki in Notion (all 65 pages read on 2026-09-29; the four below are the main ones). The Notion pages mark themselves "unverified"; facts marked *verified* above were checked against live deals.

- [Building Doc: Product Expansion H2 2026](https://app.notion.com/p/holdbar/Building-Doc-Product-Expansion-H2-2026-3bb657695d5980d08fe4f391317653f9)
- [Pricing Update Sep 2026](https://app.notion.com/p/holdbar/Pricing-Update-Sep-2026-3c9657695d59809c9a52deef5e748b7b)
- [Quote & ARR Infrastructure: Full Reference](https://app.notion.com/p/holdbar/Quote-ARR-Infrastructure-Full-Reference-33e657695d59810c8d7be1a23390b4ab)
- [Finance & HubSpot Data](https://app.notion.com/p/holdbar/Finance-HubSpot-Data-351657695d598016b73edf4175a4ff49)
- Per-product references: [Core deal properties](https://app.notion.com/p/33e657695d598131b435f6f4bb89a25a) · [Meta ads](https://app.notion.com/p/33c657695d598106aea5f2f6244eec3c) · [Add-on ARR design](https://app.notion.com/p/33c657695d59812b81f0edb96b7b7dd1) · [Accounting](https://app.notion.com/p/383657695d598160b4efe3c4c5507bf1) · [Reviews](https://app.notion.com/p/3d0657695d5980efa1b9f24af1b52d26) · [Google Ads](https://app.notion.com/p/3d0657695d5980d1a703c6caf02a34e0) · [Websites](https://app.notion.com/p/3d0657695d5980ca823ddb14163629a0) · [Adding a new product](https://app.notion.com/p/33e657695d5981b0b032da2690eb09a1)
- [HubSpot Playbook index](https://app.notion.com/p/holdbar/2d2657695d598056832ecd61b992aeab). Its "GTM Tools Subscriptions" row returned 404. About 15 pages (SDR, webinars, lead gen, handovers) hold no HubSpot data.
