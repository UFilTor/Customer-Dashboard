# QA Learnings Ledger

## 2026-05-02T01:34:00Z — ux-auditor

**Gap: alpha-channel contrast false positives.** The default contrast measurement script in `references/ux-auditor.md` walks parents looking for the first non-transparent background, but doesn't *composite* RGBA alpha against the resolved background. On this dashboard the "121d overdue" pill is `rgb(147, 63, 41)` text on `rgba(184, 74, 45, 0.10)` background — the script reported a 1.36:1 ratio (catastrophic fail) when the real composited ratio over the row's `rgb(248, 246, 237)` parent is 5.7:1 (passes AA). I had to write a separate composite-aware script to verify. False fail rate would be high on any design system that uses tinted overlays for status pills.
**Suggested change:** `references/ux-auditor.md` — update the contrast measurement script to walk all ancestors collecting RGBA layers, then composite them in order before computing luminance. Or document the limitation prominently and recommend a manual re-check for any RGBA-bg violations.

## 2026-05-02T01:34:00Z — ux-auditor

**False signal: text-transform: uppercase makes button identification by innerText brittle.** Buttons styled with `text-transform: uppercase` return their innerText as uppercase via `.innerText` even though the underlying text node is mixed case. So `.find(b => b.innerText === 'Boat Tour Como')` failed; only `BOAT TOUR COMO` matched. This is consistent Chromium behavior but tripped me up multiple times when chaining `playwright-cli click "Boat Tour Como"` (which uses the accessibility name pulled from the rendered text, also uppercased).
**Suggested change:** `agents/ux-auditor.md` — add a Patterns section noting that on apps using `text-transform`, target buttons by their case-folded innerText or by `aria-label`/`title`/`textContent` (which preserves source case) rather than the styled visible text.

## 2026-05-02T01:34:00Z — ux-auditor

**Tooling friction: synthesized KeyboardEvents don't trigger window-listener apps.** The Customer Dashboard uses a single capture-phase keydown listener on `window`. Dispatching `new KeyboardEvent('keydown', { ... })` on `document.body` or `window` directly via `eval` — even with `bubbles: true, cancelable: true` and the right `key` — did NOT trigger the listener for `?` or for `Cmd+K`. Only real keyboard input via `playwright-cli type "?"` worked. This was puzzling because the listener IS attached to window with capture; my hypothesis is the listener guards on `event.isTrusted` somewhere down the chain (or the framework's React event wrapper does). Burned ~10 minutes debugging.
**Suggested change:** `references/ux-auditor.md` — add a measurement-utility note: "For apps with global keyboard handlers, prefer `playwright-cli type` over synthesized `KeyboardEvent` dispatch. Many apps gate on `event.isTrusted` or use frameworks that do." Also document the hierarchy: `playwright-cli press <key>` > `type` > eval-dispatched events.

## 2026-05-02T01:34:00Z — ux-auditor

**Gap: hydration-mismatch errors are user-impacting but easy to miss in a category-based audit.** Hydration mismatches are a Console error visible in the playwright-cli console log file but the rubric has no explicit check for them. They cause client-side tree regeneration on first load, visible jank, and indicate a bug that will eventually break under SSR caching. I caught it because I read the console log; if I'd skimmed only the snapshot I'd have missed it.
**Suggested change:** `references/ux-auditor.md` — add an explicit deterministic check under Category 8 (Feedback & Response) or a new "Stability" category: scan `.playwright-cli/console-*.log` for hydration errors, suspended-tree-regeneration warnings, and React error boundaries firing. These are user-experienced but invisible to snapshots.

## 2026-05-02T01:38:00Z — performance-profiler

**Gap: API payload analysis is missing from the static checks.** The reference's static checks have A5 ("Over-fetching: API routes returning full objects when UI only needs 2-3 fields") and A10 ("Large API response payloads >100KB"), but the profiling loop never proactively measures payload sizes. I had to manually `curl | wc -c` each route. This dashboard turned out to ship 1.5MB JSON for a view that uses 1.5KB of it — by far the highest-impact finding of the session — and would have been invisible if I'd only run the listed steps. The reference focuses on resource counts (HTTP requests, total page weight) but not per-API payload weight + response field utilization.
**Suggested change:** `references/performance-profiler.md` — add Step 10 "API Payload Audit": for each `/api/*` resource captured in Step 5, fetch it and measure raw + gz size, dump top-level keys and array lengths, then cross-reference against view files to flag fields read vs returned. Also add a static check (e.g. A11): "API route returns >50KB raw and the consuming component uses fewer than 5 fields from it" with HIGH severity.

## 2026-05-02T01:38:00Z — performance-profiler

**False signal: dev-mode resource sizes flag false positives.** The Step 5 resource-loading script reported 824KB JS on `/`, dominated by `next-devtools_index.js` (213KB) and `next/dist/client` (148KB). These chunks are dev-only and never ship to production. A naive scorecard would mark this as "Warning" (>500KB) and trigger findings, but the production gzipped JS total is actually 276KB — within the Good band. Without explicit dev-vs-prod awareness, the runtime resource step gives misleading numbers.
**Suggested change:** `references/performance-profiler.md` — add a "Dev mode bias" note in the Resource Loading section: "If running against `next dev`, expect 200-300KB of `next-devtools` resources that are not shipped in production. Cross-check with `.next/static/chunks` size from a production build or rerun against `next start` for accurate scoring." Also flag chunks matching `*devtools*`, `*dev-overlay*`, or `*hmr*` as dev-only and exclude from the JS budget.

## 2026-05-02T01:38:00Z — performance-profiler

**Tooling friction: window-event keyboard handlers don't fire from synthesized KeyboardEvents.** Same pattern reported by ux-auditor on this codebase, now hit again from the perf side. I tried to time soft navigation `g` then `m` via dispatched `KeyboardEvent`s on `window`; the listener (capture-phase, attached to window in `page-client.tsx`) silently ignored them. Switching to `playwright-cli type "g"` worked. Already reported in the ledger so this is reinforcement, not a new observation — flagging because it cost me a measurement (couldn't isolate soft-nav timing without real keypresses, and `playwright-cli type` interleaves keys with delay so the timing is also distorted).
**Suggested change:** `references/performance-profiler.md` — for Per-Route Profiling Loop's SPA Soft Navigation section, explicitly recommend `playwright-cli type` over eval-dispatched KeyboardEvents, and warn that the timing may not isolate just the soft-nav (typing latency adds noise). Suggest using `performance.mark` calls injected into the page if precise timing is needed, or measuring the `popstate` → settle window via MutationObserver.
