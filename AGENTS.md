<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Codebase patterns worth remembering

These are non-obvious conventions and footguns we've run into while working on this dashboard. Read once before writing perf-sensitive code.

## HubSpot fetch patterns

- **Prefer batch associations over `/deals/search`.** The `crm/v3/objects/deals/search` endpoint with `associatedWith` filters is fundamentally slow (1-3s/page, sequential pagination). Use `crm/v4/associations/{from}/{to}/batch/read` instead — ~100ms per parallel batch of 100 IDs. See `fetchSalesDealsForCompanies` (was 27s with search → 0.6s after switch) and `fetchZeroEventDealIds` (11s → 1.9s).
- **Always pass a `sorts` clause** when calling search endpoints. Without it pagination silently truncates after a few pages and the results get cached for 15 min. Canonical retry helper: `searchDealsPage` in `src/lib/pay-migration.ts`.
- **Parallelize independent batches.** Outer batch loops over IDs (typically 80-100 per HubSpot call) should run via `Promise.all`. Inner pagination has to stay sequential because `next-cursor` is opaque.
- **No next-activity-type property exists.** Derive the type from `hs_notes_next_activity` object coordinates: the `<objectTypeId>-` prefix maps `0-27` Task, `0-47` Meeting, `0-48` Call, `0-49` Email, `0-46` Note (see `nextActivityTypeLabel` in `src/lib/portfolio.ts`).
- **Auto-calculated HubSpot properties are computed independently and can disagree.** Example that produced a real bug: `hs_notes_next_activity` can report type "Meeting" while `hs_next_meeting_start_time` is empty. Never build logic that assumes two calculated properties are consistent; handle the disagreeing case explicitly.

## Caching

- 15-min in-memory `Cache` (`src/lib/cache.ts`) on each route, with `getOrBuild` for in-flight dedupe (multiple parallel requests for the same key share one HubSpot fetch).
- Cache keys include the filter scope (e.g. `onboarding:${ownerIds}`) so different filter views get their own window. Bounded LRU at 64 keys to prevent unbounded growth from unknown ownerIds.
- API routes also send `Cache-Control: s-maxage=840, stale-while-revalidate=60` so Vercel's edge CDN caches identical responses for 14 min.
- A Vercel cron at `*/14 * * * *` (`/api/cron/warm`, gated by `CRON_SECRET`) refreshes all three main routes proactively so users almost never see cold builds.
- **New payload fields must tolerate `undefined` in client code.** The edge cache means that for up to 14 min after a deploy, the new client can receive pre-deploy cached payloads that lack newly added fields, even when the TS type says the field is required. Normalize with `?? null` / `== null` in every derivation that consumes a new field, or the UI renders literals like "Next: undefined" during the window. This shipped-adjacent bug was caught twice in review; write the undefined-tolerance test alongside the field.

## Cross-call shared state

- `fetchOwnerNames` returns the entire HubSpot owner directory regardless of which IDs you pass — it's the same data every time. We added a 10-min request-level cache + in-flight promise dedupe so it's hit once per request even when called 4-5× from different code paths. Don't re-fetch the directory just because you have a different owner ID; reuse via `fetchOwnerNames`.

## Concurrency in `buildOnboardingPayload`

- Lifecycle deals → companyMap is the gating dependency for sales deals. Don't await the main parallel block first — chain `salesDealsPromise = companiesPromise.then(...)` so it overlaps with the meetings/contacts/ownerMeetings fetches.
- The orphan-meetings flow's "meetings → companies" and "meetings → contacts" assoc fetches are independent — fire both in parallel even though only one is needed when the company link is direct (small overhead, big win when contact fallback fires).

## Strict react-hooks lint (`eslint-config-next`)

- `react-hooks/refs` (no ref mutation during render): mirror via an effect with no deps array.
  ```ts
  useEffect(() => { ref.current = value; });
  ```
- `react-hooks/set-state-in-effect`: use the "adjust state during render" pattern with a `prevX` slot. Convergent — fires only when inputs differ.
  ```ts
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setOtherState(reset);
  }
  ```
- DOM measurements during render (same lint family): when you need `offsetTop` / `offsetWidth` / etc. for a render-time prop like `useWindowVirtualizer({ scrollMargin })`, don't read `ref.current` during render. Use a callback ref that writes into state.
  ```tsx
  const [offset, setOffset] = useState(0);
  const measureRef = useCallback((el: HTMLElement | null) => {
    if (el) setOffset(el.offsetTop);
  }, []);
  // <div ref={measureRef}>
  ```
  Pattern lives in `PortfolioView.tsx` (`setListOffsetTop`).

## Virtualization (`@tanstack/react-virtual`)

**`PortfolioView.tsx` no longer virtualizes.** Pages are capped at 50 rows (`PAGE_SIZE` in `PortfolioContainer.tsx`) — cheap enough to render in full flow layout. The footguns below cost three separate live bugs for no measurable perf gain at that row count, so the virtualizer was removed; sticky-section tracking and keyboard scroll-into-view now read real DOM (`getBoundingClientRect()` / `scrollIntoView()`) instead of a measurement cache. Keep this section for the next time a list actually needs windowing (hundreds+ rows, no pagination):

- Page-scroll virtualization uses `useWindowVirtualizer`. `scrollMargin` must equal the list's offset from page top (measure via the callback-ref pattern above). Without it, the visible window is wrong by exactly the toolbar height.
- Don't re-derive cumulative offsets from `estimateSize` for sibling logic like sticky section headers or scroll-to-row. The estimate drifts the moment any row deviates from the average. Real positions live in `virtualizer.measurementsCache[i].start`; use those.
- **`measurementsCache[i].start` is in ABSOLUTE (document) coords when `scrollMargin` is set.** Not list-relative. So a "cursor" you compare against must also be absolute (`window.scrollY + stickyHeight`), not list-relative (`window.scrollY + stickyHeight - listOffsetTop`). This is what caused the old Portfolio sticky-section indicator to never fire — the comparison was list-relative vs absolute, never crossing.

## Custom interactive-row keyboard access

Clickable list rows get keyboard/AT access one of two ways depending on the markup:

- **Row is a styled `<div>`/grid with no interactive children**: make the row itself a real `<button>`. Real button semantics, zero extra ARIA.
- **Row contains interactive controls, or is a real `<table><tr>`** (e.g. `PortfolioRow.tsx` with its QuickActions cluster, `KanbanCard.tsx`, `PayMigrationView.tsx` rows): a `<button>`/`<a>` can't legally nest inside a `<button>` (nor inside a `<tr>`). Use `role="button"` + `tabIndex={0}` + a manual Enter/Space `onKeyDown` handler instead — see `clickableRowProps()` in `PayMigrationView.tsx`. Skip it (return `{}`) when the row has no click handler, so non-actionable rows don't become dead tab stops. Known tradeoff: ARIA treats `role="button"` children as presentational, so nested controls are Tab-reachable but announced without row context by some AT.

Either way, the focus ring is already covered: `globals.css`'s `:focus-visible` rule includes `[role="button"]` alongside `button, a, input, select`, so a `role="button"` row gets the same visible ring for free.

Nested controls also need two guards: stop click/keydown propagation on the controls' wrapper so activating one never triggers the row's own open handler, and keep the page-level capture keydown handler (page-client.tsx) yielding Enter to any focused `a`/`button`/`[role="button"]` target so native activation wins over list-open.

## Sticky scroll-shadow pattern

When you want a sticky element to add a shadow once it pins to the viewport, **don't track `getBoundingClientRect().top` of the sticky element**. It's flaky across TopBar layouts and easy to fire too early (before the sticky has actually pinned). Instead, place a 1px sentinel element directly above the sticky and watch it with `IntersectionObserver`:

```tsx
const sentinelRef = useRef<HTMLDivElement | null>(null);
const [scrolled, setScrolled] = useState(false);
useEffect(() => {
  const node = sentinelRef.current;
  if (!node) return;
  const obs = new IntersectionObserver(
    ([entry]) => setScrolled(!entry.isIntersecting),
    { threshold: 0 }
  );
  obs.observe(node);
  return () => obs.disconnect();
}, []);

// <div ref={sentinelRef} aria-hidden style={{ height: 1, marginBottom: -1 }} />
// <div className={`pf-sticky${scrolled ? " scrolled" : ""}`}> ... </div>
```

Fires the exact frame the strip pins, no scroll listener, no rAF. Pattern lives in `PortfolioView.tsx` (Portfolio toolbar) and `MeetingPrepView.tsx` (day selector).

## Signals taxonomy + display

- `src/lib/signals.ts` is the single source of truth for the watch-out signal list (`computeWatchOutSignals`) AND the stage-applicability map (`STAGE_APPLICABILITY`). Pass `stage` into `computeWatchOutSignals` and the result is automatically filtered by stage. Both Portfolio and Meeting Prep use this — they cannot compute different signal sets for the same deal.
- `src/lib/signal-display.ts` owns severity tokens (`signalStyle("bad" | "warn")`), per-stage calm copy (`calmCopy(stage, "glyph" | "sentence")`), pill compression (`pillText`), and the kind→key mapper. Components (`SignalPill`, `WatchOutFor`, `CalmGlyph`) consume these — when adding a new severity treatment or new "no signals" copy, edit signal-display.ts, not the components.
- Severity rendering convention: `bad` = solid `--rust` fill + `--rust-fg` cream text. `warn` = transparent bg + 1px `--rust` border + `--rust` text. Mixed treatment by design (DESIGN.md). Both Portfolio table-row pills and Meeting Prep WatchOutFor cards apply this.

## Search-LLM allowlist and pseudo-fields

- `src/lib/search-llm.ts` (`ENTITY_FIELDS`) and `src/lib/search.ts` (`ENTITY_FIELDS` Set) must stay in sync — the prompt presents the allowlist to the LLM, the runtime validates against it. Adding a new HubSpot property means editing both.
- **Pseudo-fields** (currently only `outstanding_amount_eur`) are validated like real fields but stripped from the HubSpot request and applied as in-memory post-filters (`matchesPseudoFilter` in `search.ts`). The runtime ensures their dependencies are returned (`outstanding_amount` + `deal_currency_code` are always in the deal `SEARCH_RETURN_PROPS`). Use this pattern for any cross-currency or computed threshold the user asks for in a unit HubSpot doesn't natively store.
- **No cross-entity intersection.** Each `target` is its own HubSpot search; the runtime doesn't AND-combine results across targets. `customer_stage` (deal-only) and `health_score` (company-only) cannot co-filter. The prompt includes a field-to-entity routing rule and an example that drops the weaker qualifier rather than misroutes it.

## Dashboard container lifecycle

- **Opening a company detail unmounts the active dashboard container.** page-client renders the detail node INSTEAD of the dashboard body, so all container state (selected signals, refine, sort, page, focus) resets when the user closes the detail. Meeting Prep deliberately works around this by keeping its container mounted inside a `display: none` wrapper while the detail renders on top (see the comment in page-client). If a dashboard's state must survive a detail round-trip, copy that keep-mounted pattern; do not try to persist individual state slots.
- **Never thread a subview toggle into ViewTransition's key.** A key change there remounts the entire container: state wipe, skeleton flash, and a full API refetch. This shipped as a Critical review finding once. Animate subview swaps INSIDE the container by keying a wrapper around only the presentational branch, e.g. `PortfolioContainer`'s `<div key={view} className="view-fade">` around the table/board ternary. Container state lives above the keyed node and survives.

## URL state pattern

- All view state (`dashboard / variant / filter / payFilter / onboardingSubview / selectedCompanyId`) lives in URL search params via `history.replaceState`, with localStorage as fallback for first visit. Read happens in a mount-only `useEffect`, NOT lazy `useState` init — lazy init breaks SSR hydration because `window.location` is undefined on server. Browser back/forward via `popstate` listener.

## Inline styles, not Tailwind

- Tailwind 4 is configured but only powers layout primitives in `globals.css`. The design system uses inline `style={{...}}` with CSS custom properties (`var(--moss)`, `var(--citrus)`, etc.). Match that — don't sprinkle Tailwind utility classes inside a component that uses inline styles.

## Window-event keyboard system

- `page.tsx` has a single capture-phase keydown listener. It reads current view state from `stateRef` and dispatches custom events; views subscribe and own their own focused-index state. Dispatch from `page.tsx`, subscribe in the relevant view rather than threading callbacks through props.

## Auth

- Production runs behind a Vercel team password (Understory vibers). The app itself has no in-app auth gate — no `middleware.ts`, no `getServerSession`. If you re-introduce auth, the middleware approach we tried lives in git history at `5a22313`.

## HubSpot links

- All "Open in HubSpot" deep-links go through `hubspotCompanyUrl` / `hubspotDealUrl` in `src/lib/hubspot-links.ts` so they consistently include `?utm_source=cs-dashboard`. Don't hand-build HubSpot URLs.
- HubSpot record-page `?interaction=` deep-links require the **deal record (0-3), not the company (0-2)**. A company URL with `?interaction=schedule|task|call|note` just opens the company page; the same query string on a deal-record URL opens the corresponding create flow. Use `hubspotDealUrl(deal.hs_object_id)` and append `&interaction=...` (the helper already produces `?...utm` so it's `&`, not `?`).

## LLM classifier caches

- LLM-tagging helpers (e.g. `src/lib/pay-q2-classifier.ts`) cache classifications per-process keyed on the input text. Editing the system prompt does **not** invalidate cached entries — restart the dev server (or redeploy) to re-classify. If a prompt change isn't taking effect, check process age before chasing other causes. Same applies to any future LLM tagging helper that follows this pattern.

## LLM prompt clarity for numeric deltas

When a prompt hands the model a bare before/after pair (e.g. a health-score change `41 -> 49`), don't assume it infers the right direction — it was observed reading an *increase* as "dropping" and contradicting the exact numbers it was just given. Compute and spell out the direction yourself (`IMPROVED by 8` / `DECLINED by 13`) rather than relying on the model to compare two numbers correctly. Pattern lives in `buildRecapPrompt`'s ACCOUNT STATE block in `src/lib/summarize.ts`.

## Third-party CSP origins

If we tighten CSP (currently permissive), these origins need allowlist entries for the analytics we already ship:

- Vercel Speed Insights: `script-src https://va.vercel-scripts.com`, `connect-src https://vitals.vercel-insights.com`
