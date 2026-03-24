# Enriched Attention Rows - Inline Chips

## Problem

The "Needs Attention" rows currently show the company name, MRR, and signal-specific detail (e.g. "3d overdue"). To decide what action to take, you have to click into the company card to see health, volume, pay status, and trends. This adds friction and makes it harder to prioritize at a glance.

## Solution

Add 4 inline metric chips to the right side of every company row in the attention list. These surface key company card data directly on the row so you can triage without clicking through.

## Chips (left to right)

### 1. Health Score
- Source: `health_score` (company field)
- Display: Label + score number, e.g. "Healthy (82)", "At Risk (45)"
- 4 categories with colors:
  - **Healthy** (80+): green chip (`#D1FAE5` bg, `#065F46` text)
  - **Monitor** (60-79): amber chip (`#FEF3C7` bg, `#92400E` text)
  - **At Risk** (40-59): orange chip (`#FED7AA` bg, `#9A3412` text)
  - **Critical Churn Risk** (<40): red chip (`rgba(192,57,43,0.1)` bg, `var(--rust)` text)
- Each chip has a colored dot indicator matching severity
- If score is missing, show "No score" in neutral style

### 2. Booking Volume 12M
- Source: `understory_booking_volume_12m` (company field, already in EUR)
- Display: abbreviated, e.g. "€186k", "€1.2M"
- Always neutral chip style (`#F3F2ED` bg, `var(--green-100)` text)
- If missing/zero, show "-"

### 3. Volume Trend
- Computed from: `understory_booking_volume_3m` vs derived previous 3 months
  - Previous 3m = (`understory_booking_volume_6m` - `understory_booking_volume_3m`)
  - If 6m field is missing or previous period is zero/negative, don't show a trend
- Display: arrow + percentage, e.g. "↑ 12%", "↓ 24%", "↔ 0%"
- Color:
  - Positive: green chip
  - Negative: red chip
  - Flat (0% or no data): neutral chip

### 4. Understory Pay
- Source: `understory_pay_status__customer` (deal field)
- Display:
  - Active: green dot + "Pay" (green chip)
  - Inactive/missing: red dot + "No Pay" (red chip)

## Deduplication Rule

If a metric shown as a chip is already present in the signal detail line, remove it from the detail line. The chip takes precedence. Examples:
- **Health Score group**: The detail line currently shows the health category (e.g. "Critical Churn Risk"). Remove it since the health chip already shows this. Keep only the previous category comparison ("was At Risk (45)") and change timestamp ("6d ago").
- **Any group showing MRR in detail**: If MRR is visible in chips, don't repeat it on the detail line.

## Data Model Changes

Extend `AttentionCompany` type with new optional fields:

```ts
healthScore?: string;       // Raw health_score value
volume12m?: number;         // Booking volume 12m in EUR
volume3m?: number;          // Booking volume 3m in EUR
volume6m?: number;          // Booking volume 6m in EUR
payStatus?: string;         // Understory Pay status from deal
```

## API Changes

The `/api/attention` route must request these additional HubSpot properties when building the attention list:
- `health_score`
- `understory_booking_volume_12m`
- `understory_booking_volume_3m`
- `understory_booking_volume_6m`

And from the associated deal:
- `understory_pay_status__customer`

Map these onto the new `AttentionCompany` fields before returning.

## Bug Fix

Update `scoreToLabel()` in `src/lib/health-score.ts` to return "Critical Churn Risk" instead of "Critical" for scores below 40.

## Component Changes

### AttentionGroup.tsx - CompanyRow
- Add a `row-chips` container on the right side of the top row (flex, gap-5px)
- Render 4 chips using a new `<MetricChips>` component or inline
- Apply deduplication: check if the signal's detail line would repeat chip data, and skip those parts

### New: MetricChips component (or inline in CompanyRow)
- Takes: `healthScore`, `volume12m`, `volume3m`, `volume6m`, `payStatus`
- Renders the 4 chips with correct colors and formatting
- Handles missing data gracefully (show "-" or skip chip)

### Volume abbreviation helper
- New utility function: abbreviates EUR amounts (€186,000 -> "€186k", €1,200,000 -> "€1.2M")

## Preview Mock Data

Update the preview page mock data to include the new fields so chips render in preview mode.

## Visual Reference

See mockup at `.superpowers/brainstorm/47234-1774387528/attention-rows-final.html`
