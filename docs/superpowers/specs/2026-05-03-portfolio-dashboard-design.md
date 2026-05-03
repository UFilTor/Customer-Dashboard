# Portfolio dashboard: design

**Date:** 2026-05-03
**Status:** Draft, pending implementation plan
**Supersedes:** the placeholder `onboarding` and `retention` dashboard slots in `VariantPicker.tsx`. Status remains accessible during rollout.

## Goal

Replace the planned Onboarding + Retention dashboards (and become the primary triage view in place of Status) with one Portfolio dashboard: every account in the user's filter scope, one row each, signal pills as decoration, multi-select filter and rich sort to focus.

The win over Status is visibility of the whole book, not just the fires. The win over building separate Onboarding + Retention dashboards is continuity through stage transitions and a single signal taxonomy.

## Non-goals

- Replacing Meeting prep, Pay migration, or Lookup. They stay as-is.
- Building Bloom (still a placeholder).
- Multi-sort, CSV export, or saved named views beyond a single per-user default.

## Architecture

```
HubSpot ─► src/lib/portfolio.ts (extends signals + onboarding building blocks)
              │
              ▼
        /api/portfolio  (15-min TTL cache, keyed by ownerIds, edge runtime)
              │
              ▼
        PortfolioContainer.tsx (fetch + global filter + signal filter + sort state)
              │
              ▼
        PortfolioView.tsx (dense table, presentation only)
```

Reuses existing patterns: in-memory `Cache` from `src/lib/cache.ts` with `getOrBuild` request dedupe, `Cache-Control: s-maxage=840, stale-while-revalidate=60`, cron warm at `/api/cron/warm` extended to include `/api/portfolio`.

The route returns variant-agnostic rows. Future Split and Kanban layouts (see Future variants) consume the same payload without server-side changes.

## Data shape

```ts
type PortfolioStage =
  | "Onboarding"
  | "Adopted"
  | "Started"
  | "Ramp Up"
  | "Established";

type PortfolioSignalKey =
  | "overdue_invoices"
  | "open_invoices"
  | "no_future_events"
  | "health_dropped"
  | "stuck_in_step"
  | "volume_declining"
  | "wish_to_churn"
  | "gone_quiet";

interface PortfolioRow {
  id: string;                 // company id
  name: string;
  domain: string | null;
  ownerId: string | null;
  ownerName: string | null;

  stage: PortfolioStage;
  daysInStage: number | null;
  customerLiveDate: string | null;

  revenue: number;            // EUR, computed via existing formula
  healthScore: number | null; // 0-100
  daysSinceContact: number | null;

  signals: WatchOutSignal[];  // every firing signal, ordered bad to warn

  // Signal-specific values surfaced for sort key extraction.
  // Null when the corresponding signal is not firing.
  overdueDays: number | null;       // days past due (positive); null when not overdue
  daysUntilDue: number | null;      // days until due (positive); null when not open or already overdue
  outstandingEur: number | null;
  openInvoiceCount: number | null;
  daysSilent: number | null;        // for no_future_events / gone_quiet
  healthDrop: number | null;        // previousCategory − healthScore
  daysPastExpectedStep: number | null;
  volumeDropPct: number | null;
  prior3mVolume: number | null;
  wishToChurnAt: string | null;
}

interface PortfolioResponse {
  rows: PortfolioRow[];
  generatedAt: string;
  totalsByStage: Record<PortfolioStage, number>;
  totalsBySignal: Record<PortfolioSignalKey, number>;  // unfiltered counts for pill labels
}
```

## Signal taxonomy

Extends current 4 signals to 8. Stage applicability gates which signals can fire on a row.

| Signal | Stages where it fires | Severity |
|---|---|---|
| `overdue_invoices` | All | bad |
| `wish_to_churn` | All | bad |
| `volume_declining` | Ramp Up, Established | bad |
| `no_future_events` | All | bad |
| `open_invoices` | All | warn |
| `stuck_in_step` | Onboarding, Adopted, Started | warn |
| `health_dropped` | All | warn |
| `gone_quiet` | All | warn (30+ days) / bad (45+ days) |

Stage applicability lives in `signals.ts` next to the signal metadata so a row only collects signals that make sense for its stage. `volume_declining` requires 6 months of volume history, hence Ramp Up onwards. `stuck_in_step` requires a meaningful `EXPECTED_DAYS` baseline, which only exists for the Onboarding/Adopted/Started range.

`SECTION_ORDER` updates to the explicit 8-signal order below. The order is load-bearing because the keyboard `1`–`8` shortcuts map to it, and because Daily Brief and the future Kanban variant render sections in this sequence:

1. `overdue_invoices`
2. `wish_to_churn`
3. `volume_declining`
4. `no_future_events`
5. `open_invoices`
6. `stuck_in_step`
7. `health_dropped`
8. `gone_quiet`

Bad-severity signals come first, then warn. Within each severity, ordering matches scan priority for daily triage.

Pill color mapping in `SIGNALS` extends with new entries: bad-severity signals share the existing `#B84A2D` family, warn-severity share the existing warn palette.

## Default state

On first load (no saved default):
- Global filter: All
- Signal filter: none
- Sort: **Urgency descending** (extends `urgencyScore` to weight all 8 signals)

The urgency-default mirrors the current Daily Brief feel: your eye lands on the same urgent rows you see in Status today. The rest of the book is below, scrollable.

When the user has saved defaults (see Per-user defaults), those override the first-load values.

## Filter + sort contract

### Multi-select signal filter

Pill row above the table shows all 8 signals plus a "Clear" chip that appears when at least one signal is active. Clicking a pill toggles it. Selected pills render filled, unselected outline.

Filter logic: a row passes if **any** selected signal is firing (OR semantics).

Pill counts show the total within the current **global** filter scope (region/person), but unaffected by the signal filter itself, e.g. "Overdue · 7" remains visible even while you're filtering by Health. This way you can see what you'd unlock by toggling without losing the count.

URL serialization: `?s=overdue_invoices,wish_to_churn` (comma-separated). Empty or missing param means no filter.

### Sort menu

The available sort options depend on the signal filter selection:

- **0 signals selected** → universal sorts only.
- **1 signal selected** → universal + that signal's specific sorts.
- **2+ signals selected** → universal sorts only (signal-specific sorts only make sense for one signal at a time; the menu omits them rather than disabling).

Universal sorts (always available):

| Key | Description |
|---|---|
| `urgency` | Urgency descending (default) |
| `name` | Name A–Z |
| `revenue` | Revenue descending |
| `health` | Health score ascending (worst first) |
| `last_contact` | Days since last contact descending (longest silence first) |
| `days_in_stage` | Days in current stage descending |

Signal-specific sorts (available only when exactly one signal is selected):

| Signal | Specific sort options |
|---|---|
| `overdue_invoices` | Oldest outstanding · Value of overdue · Number of invoices |
| `open_invoices` | Due soonest · Value · Count |
| `no_future_events` | Longest silence · Revenue |
| `health_dropped` | Biggest drop · Current score (asc) |
| `stuck_in_step` | Longest stuck · Days past expected |
| `volume_declining` | Biggest % drop · Prior 3m volume |
| `wish_to_churn` | Most recently flagged |
| `gone_quiet` | Longest silence |

Implementation: `getSortOptions(selectedSignals: PortfolioSignalKey[]): SortOption[]`. Each option carries a `keyExtractor: (row: PortfolioRow) => number | string | null` and direction. When the filter changes such that the current sort is no longer offered (e.g. user clears the signal filter while a signal-specific sort is active), sort resets to `urgency`.

URL serialization: `?sort=oldest_outstanding`. Sort param round-trips through `popstate` like the existing dashboard/variant params.

## Per-user defaults

Extend the existing localStorage default-filter pattern. Store under `ud-v2-portfolio-default`:

```ts
{
  filter: GlobalFilter;       // All / Region / Person: same as today
  signals: PortfolioSignalKey[];       // multi-select
  sort: PortfolioSortKey;
}
```

UI affordances:

- "Save as default" link in the filter/sort bar.
- A subtle "Defaults saved" toast confirms.
- "Reset to defaults" link appears whenever current state diverges from saved.

Keyboard: `Cmd+S` (Mac) / `Ctrl+S` (Windows/Linux) saves current state as default. The capture-phase listener calls `preventDefault()` on this combo only when `dashboard === "portfolio"` so the browser save dialog is suppressed inside Portfolio without affecting other dashboards.

When the user has no saved default, "Save as default" is the only affordance; "Reset" is hidden.

## Row design

One line per row. Left to right:

1. Stage badge (small, color-coded by stage)
2. Account name (bold)
3. Signal pills (max 3 visible, "+N" overflow chip if more)
4. Health score (number, color-coded: green ≥80, yellow 60–79, orange 40–59, red <40)
5. Revenue (formatted EUR, right-aligned)
6. Last contact (relative, e.g. "12d")
7. Owner avatar/initial

Empty (zero-signal) rows show stage badge + name + health + revenue + last contact + owner. No pills. Visually quieter: eye skips to noisy rows.

Click anywhere on a row → existing company detail card flow (`/api/companies/[id]`). Inherits the existing `ud-list-open` event-driven open behavior.

Inline styles using CSS custom properties (`var(--moss)`, `var(--citrus)`, etc.), matching the rest of the v2 design system. No Tailwind utilities inside components.

## Keyboard shortcuts

Matches the existing single capture-phase listener in `page-client.tsx`. Portfolio dispatches and subscribes to custom events rather than threading callbacks.

| Key | Action | Implementation |
|---|---|---|
| `↑ / ↓` | Navigate rows | Existing `ud-list-nav` |
| `Enter` | Open company detail | Existing `ud-list-open` |
| `Esc` | Close detail | Existing |
| `R` | Refresh dashboard | Existing `ud-refresh-dashboard` |
| `1`–`8` | Toggle signal filter (mapped via `SECTION_ORDER`) | New `ud-portfolio-signal-toggle` |
| `0` | Clear all signal filters | New `ud-portfolio-signal-clear` |
| `S` | Open sort menu (cycles through options on repeat) | New `ud-portfolio-sort-cycle` |
| `F` | Focus global filter pill | Existing `ud-filter-type-open` |
| `Cmd/Ctrl + S` | Save current filter + sort as default | New `ud-portfolio-save-defaults` |
| `?` | Cheat sheet | Existing: extended with a Portfolio block |

The existing `ud-filter-pill-state` mirror pattern is reused for the signal filter pill so other shortcuts can gate themselves correctly.

## URL state

Extends the existing pattern in `page-client.tsx`:

| Param | Meaning |
|---|---|
| `d=portfolio` | Dashboard selector (default once flipped: see Rollout) |
| `fk` / `fv` | Existing global filter (kind + value) |
| `s=overdue_invoices,wish_to_churn` | Multi-select signal filter |
| `sort=oldest_outstanding` | Active sort key |
| `c=<companyId>` | Open company detail |

Browser back/forward continues to round-trip through the existing `popstate` listener.

## Caching + performance

- `/api/portfolio` uses the existing `Cache` (`src/lib/cache.ts`) with key `portfolio:${ownerIds}`. 15-min TTL. `getOrBuild` dedupes parallel requests.
- `Cache-Control: s-maxage=840, stale-while-revalidate=60` for Vercel edge cache.
- `/api/cron/warm` extends to refresh portfolio for the all-owners and per-region keys.
- Edge runtime, matching `/api/attention`.
- Build pattern follows the documented HubSpot best practices in `AGENTS.md`: prefer batch associations over `/deals/search`, always pass a `sorts` clause when search is unavoidable, parallelize independent batches.
- Follows the lazy-fetch pattern: `/api/portfolio` returns row-level data only. Heavier per-record data still backfills via `/api/companies/[id]` on click.

## Code touch list

### New files

- `src/lib/portfolio.ts`: payload builder
- `src/app/api/portfolio/route.ts`: route handler
- `src/components/design/views/PortfolioContainer.tsx`: fetch + filter + sort state
- `src/components/design/views/PortfolioView.tsx`: presentation
- Tests: `src/lib/portfolio.test.ts`, signal-stage applicability tests in `signals.test.ts`

### Updated files

- `src/lib/types.ts`: add `PortfolioStage`, `PortfolioSignalKey`, `PortfolioRow`, `PortfolioResponse`, `PortfolioSortKey`, `PortfolioDefaults`
- `src/lib/signals.ts`: add stage applicability map, extend `SIGNALS` and `SECTION_ORDER` for 8 signals, flip `no_future_events` to bad
- `src/lib/urgency.ts`: extend `urgencyScore` to weight new signals
- `src/components/design/VariantPicker.tsx`: add `portfolio` entry, mark `available: true`; remove placeholder `onboarding` and `retention` entries from `DASHBOARDS`
- `src/app/page-client.tsx`: register portfolio dashboard, signal-filter URL state, sort URL state, save-defaults handler, cheat-sheet entries
- `src/lib/prefetch.ts`: add `prefetchPortfolio`
- `src/app/api/cron/warm/route.ts`: warm `/api/portfolio`
- `src/components/ShortcutCheatSheet.tsx`: Portfolio block

### Untouched

Meeting prep, Pay migration, Lookup, Status (kept as-is during rollout).

## Rollout

1. **Build.** Ship Portfolio with `available: true` alongside Status. Default landing dashboard stays `status`.
2. **Use it.** Filip and the team try Portfolio for a few days. Iterate on row density, sort defaults, signal taxonomy, urgency weights based on real use.
3. **Flip default.** Change initial `dashboard` state in `page-client.tsx` from `"status"` to `"portfolio"`. Status remains in the picker.
4. **Hide Status.** Flip `available: false` for Status in `DASHBOARDS`. URL `?d=status` continues to work for fallback.
5. **Delete Status.** After ~2 weeks of confirmed disuse, remove Status code paths.

The placeholder `onboarding` and `retention` entries in `DASHBOARDS` are removed in step 1, since they were never available and Portfolio absorbs their purpose.

## Future variants (deferred, not removed)

V1 ships a single table layout. Future Portfolio variants are designed-for but not built:

- **Split**: left rail signal sections, right pane account list. Useful for one-handed signal triage.
- **Kanban / By signal**: column per signal. Useful for "I want to clear all overdue invoices today" mode.

The architecture leaves room: `/api/portfolio` returns variant-agnostic rows; `DashboardKey = "portfolio"` is unchanged when variants ship; `VariantPicker` simply gains a Portfolio variant clause when the views are built.

The existing Status variants (Briefing, Split, Kanban) and their code paths stay in the codebase during rollout. They become reference implementations for the future Portfolio variants and are removed only when Status itself is removed.

## Out of scope for V1

- Split and Kanban Portfolio variants (deferred: see Future variants)
- Multi-sort
- CSV export
- Saved named views beyond a single per-user default
- Bloom dashboard
- Customizing signal stage applicability via the UI (config lives in code)

## Open questions

None blocking. Iteration knobs (urgency weights, default sort, exact pill colors, severity for borderline cases like 30-day silence) can be tuned after the team uses it for a few days.
