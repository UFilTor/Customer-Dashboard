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

## Caching

- 15-min in-memory `Cache` (`src/lib/cache.ts`) on each route, with `getOrBuild` for in-flight dedupe (multiple parallel requests for the same key share one HubSpot fetch).
- Cache keys include the filter scope (e.g. `onboarding:${ownerIds}`) so different filter views get their own window. Bounded LRU at 64 keys to prevent unbounded growth from unknown ownerIds.
- API routes also send `Cache-Control: s-maxage=840, stale-while-revalidate=60` so Vercel's edge CDN caches identical responses for 14 min.
- A Vercel cron at `*/14 * * * *` (`/api/cron/warm`, gated by `CRON_SECRET`) refreshes all three main routes proactively so users almost never see cold builds.

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

- Page-scroll virtualization uses `useWindowVirtualizer`. `scrollMargin` must equal the list's offset from page top (measure via the callback-ref pattern above). Without it, the visible window is wrong by exactly the toolbar height.
- Don't re-derive cumulative offsets from `estimateSize` for sibling logic like sticky section headers or scroll-to-row. The estimate drifts the moment any row deviates from the average. Real positions live in `virtualizer.measurementsCache[i].start`; use those.
- Reference: `PortfolioView.tsx` virtualizer setup and sticky-header tracking.

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

## Third-party CSP origins

If we tighten CSP (currently permissive), these origins need allowlist entries for the analytics we already ship:

- Vercel Speed Insights: `script-src https://va.vercel-scripts.com`, `connect-src https://vitals.vercel-insights.com`
