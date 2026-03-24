# Enriched Attention Rows - Inline Chips

## Problem

The "Needs Attention" rows currently show the company name, MRR, and signal-specific detail (e.g. "3d overdue"). To decide what action to take, you have to click into the company card to see health, volume, pay status, and trends. This adds friction and makes it harder to prioritize at a glance.

## Solution

Add 4 inline metric chips to the right side of every company row in the attention list. These surface key company card data directly on the row so you can triage without clicking through.

## Chips (left to right)

### 1. Health Score
- Source: `health_score` (company field, string representation of a number matching HubSpot property format)
- Display: Label + score number, e.g. "Healthy (82)", "At Risk (45)"
- 4 categories with colors (using existing `getHealthColor()` from health-score.ts):
  - **Healthy** (80+): green chip (`#D1FAE5` bg, `#065F46` text)
  - **Monitor** (60-79): amber chip (`#FEF3C7` bg, `#92400E` text)
  - **At Risk** (40-59): orange chip (`#FED7AA` bg, `#9A3412` text)
  - **Critical Churn Risk** (<40): red chip (`#FEE2E2` bg, `#991B1B` text)
- Each chip has a colored dot indicator matching severity
- If score is missing, show "No score" in neutral style

### 2. Booking Volume 12M
- Source: `understory_booking_volume_12m` (company field, already in EUR)
- Display: abbreviated using these thresholds:
  - < 1,000: show raw number (e.g. "€800")
  - 1,000 - 999,499: show as "k" (e.g. "€186k")
  - >= 999,500: show as "M" with one decimal (e.g. "€1.2M")
- Always neutral chip style (`#F3F2ED` bg, `var(--green-100)` text)
- If missing/zero, show "-"

### 3. Volume Trend
- Computed from: `understory_booking_volume_3m` vs derived previous 3 months
  - Previous 3m = (`understory_booking_volume_6m` - `understory_booking_volume_3m`)
  - If 6m field is missing or previous period is zero/negative: **hide the chip entirely**
- Display: arrow + percentage, e.g. "↑ 12%", "↓ 24%"
- Color:
  - Positive: green chip
  - Negative: red chip
  - Exactly 0%: neutral chip with "↔ 0%"

### 4. Understory Pay
- Source: `understory_pay_status__customer` (deal field)
- Display:
  - Active: green dot + "Pay" (green chip)
  - Inactive/missing: red dot + "No Pay" (red chip)

## Deduplication Rule

If a metric shown as a chip is already present in the signal detail line, remove it from the detail line. The chip takes precedence:

- **Health Score group**: Remove the health category from the detail line (the chip already shows it). Keep only the previous category comparison ("was At Risk (45)") and change timestamp ("6d ago").
- **Declining Volume group**: The signal itself is about volume decline, which overlaps with the volume trend chip. Keep the signal detail as-is (it may contain additional context) but don't add a redundant trend description.
- **MRR display**: The existing MRR shown on the right of the row name (line 76 of AttentionGroup.tsx) stays. It's different from volume 12m (MRR = monthly recurring revenue, volume = total booking value). No deduplication needed.

## Data Model Changes

Extend `AttentionCompany` type with new optional fields:

```ts
healthScore?: string;       // Raw health_score value (string number, e.g. "78")
volume12m?: number;         // Booking volume 12m in EUR
volume3m?: number;          // Booking volume 3m in EUR
volume6m?: number;          // Booking volume 6m in EUR
payStatus?: string;         // Understory Pay status from deal
```

## API Changes

### Company properties
All signal builders that call `fetchCompanyBatch` or similar must include these additional properties:
- `health_score`
- `understory_booking_volume_12m`
- `understory_booking_volume_3m`
- `understory_booking_volume_6m`

### Deal properties
Add `understory_pay_status__customer` to the properties array in `fetchDealForCompany()` so it's available to all signal builders that fetch deals.

For signal builders that don't currently fetch a deal (e.g. `overdue_tasks`, `gone_quiet`), add a deal fetch step. This can be batched: after building the attention company list, do a single pass to enrich any companies missing `payStatus` by fetching their associated deal.

### Mapping
Map these fields onto the new `AttentionCompany` fields in each signal builder before returning.

## Bug Fix

Update `scoreToLabel()` in `src/lib/health-score.ts` to return "Critical Churn Risk" instead of "Critical" for scores below 40.

## Component Changes

### AttentionGroup.tsx - CompanyRow
- Add a `row-chips` container on the right side of the top row (flex, gap-5px)
- Render 4 chips using a new `<MetricChips>` component
- Apply deduplication: check signal type and skip redundant info from the detail line

### New: MetricChips component
- Takes: `healthScore`, `volume12m`, `volume3m`, `volume6m`, `payStatus`
- Renders the 4 chips with correct colors and formatting
- Uses `getHealthLabel()` and `getHealthColor()` from health-score.ts for the health chip
- Handles missing data gracefully (show neutral fallback or hide chip for trend)

### Volume abbreviation helper
- New utility function in `src/lib/format.ts`: abbreviates EUR amounts using thresholds defined above

## Responsive Behavior

On narrow viewports (< 640px), chips wrap below the company name rather than forcing horizontal overflow. The chip container uses `flex-wrap: wrap` with a small gap.

## Preview Mock Data

Update the preview page mock data to include the new fields so chips render in preview mode.

## Visual Reference

See mockup at `.superpowers/brainstorm/47234-1774387528/attention-rows-final.html`
