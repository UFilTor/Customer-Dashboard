# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — Next.js dev server with Turbopack on :3000
- `npm run build` — Production build (also serves as the typecheck — there is no separate `typecheck` script)
- `npm run lint` — ESLint with `eslint-config-next`. The config enforces strict React rules (see Patterns) — don't disable them lightly.
- `npx vitest` — Run all tests
- `npx vitest <pattern>` — Run a specific file
- `npx tsc --noEmit` — Standalone typecheck if needed

## What this app does

Customer-success dashboard for Understory's CS team. Pulls live data from HubSpot CRM and surfaces:

- **Portfolio** — the primary dashboard and the default view: every account, every signal. It superseded the old Status dashboard, which has since been deleted (see git history if you need it back).
- **Meeting prep** (`?d=meeting_prep`, sometimes called "Onboarding") — meeting prep for the next 5 working days + accounts stuck past their expected step duration.
- **Pay Migration** — progress moving deals onto Understory Pay, broken down by CS owner.
- **Lookup** (`?d=search`) — natural-language search over HubSpot data.

Filtering is global (left pill = kind: All / Region / Person, right pill = value), except Pay Migration which uses its own Default/All toggle. `DASHBOARDS` in `VariantPicker.tsx` is the source of truth for what's live vs. hidden vs. not-yet-available (Bloom).

## Architecture

```
HubSpot API ──► src/lib/{hubspot,onboarding,pay-migration,portfolio}.ts
                        │
                        ▼
               src/app/api/<route>/route.ts   (TTL cache per filter / per day)
                        │
                        ▼
               src/components/design/views/<View>Container.tsx
                        │
                        ▼
               <View>.tsx                      (presentation only)
```

- `src/lib/hubspot-api.ts` is the REST primitive layer; the per-domain libs (`onboarding.ts`, `pay-migration.ts`, `portfolio.ts`, `hubspot.ts`) build view-shaped payloads from it.
- `src/lib/cache.ts` is a 15-min TTL in-memory cache used by every API route. **Cache keys include the filter** (e.g. `onboarding:${ownerIds}`) — don't share a key across filter scopes.
- `src/app/page.tsx` is the single client root. It owns dashboard + variant selection, global filter, per-variant selection memory (`selectionByScope`), the keyboard handler, and both palettes.
- `src/components/design/` is the active v2 design system. The older `src/components/*.tsx` files (SessionWrapper, ShortcutCheatSheet) are auxiliary — the dashboard renders entirely from `design/`.

### Lazy fetch pattern

Bulk endpoints stay light; heavier per-record data backfills from dedicated endpoints:

- `/api/meeting-prep` returns deals + meeting-only history. `/api/meeting-prep/history` fills calls + emails after paint. `/api/meeting-prep/day` fetches a single day outside the default 5-work-day window.
- `/api/companies/[id]` returns the full detail brief on click.

When you add new bulk fetches, follow the same pattern — return only what the list needs.

## Patterns to know

### Session start: get localhost running

At the start of a session, start or attach the dev server (launch.json is set up) and state the exact URL, including the relevant view param. Filip's first move is almost always verifying something in the browser; don't wait for him to ask "open localhost".

### CTA buttons are glyphs, not text

Action buttons on cards, rows, and company views use the dashboard's existing glyph set, never text labels, so all options fit on one line. When adding a CTA, copy the glyphs and layout from an existing card. Sibling controls (search bar, filter dropdowns, buttons in the same row) match each other's height and width exactly, and a control keeps the same size regardless of which option is selected.

### HubSpot pagination is fragile

`/crm/v3/objects/<type>/search` silently truncates pagination if you don't pass a `sorts` clause. Always include one (typically `{ propertyName: "createdate", direction: "DESCENDING" }`). And **retry transient errors (429 / 5xx)** instead of `if (!res.ok) break` — silent partial fetches get cached for 15 minutes and confuse the user. See `searchDealsPage` in `src/lib/pay-migration.ts` for the canonical retry helper.

### Inline styles, not Tailwind

Tailwind 4 is configured but only powers layout primitives in `globals.css`. The design system uses inline `style={{...}}` with CSS custom properties (`var(--moss)`, `var(--citrus)`, etc.). Match that — don't sprinkle Tailwind utility classes inside a component that uses inline styles.

### Strict react-hooks lint

`eslint-config-next` enforces `react-hooks/refs` (no ref mutation during render) and `react-hooks/set-state-in-effect`. Use:

- `useEffect(() => { ref.current = value; });` to mirror props into refs (see `useListKeyboardNav.ts`).
- "Adjust state during render" with a `prevX` state slot for prop-driven resets (see `ViewTransition.tsx`, `useListKeyboardNav.ts`).

### React 19 inline-style shorthand/longhand mixing

React 19 warns at runtime when an element mixes a shorthand style (`textDecoration`) with a longhand for the same property (`textDecorationColor`, `textDecorationThickness`). The shorthand resets the longhand silently on rerender, which is why React flags it.

Use longhands only when you need to set sub-properties:

```ts
// Wrong: warns on every rerender
{ textDecoration: "underline dotted", textDecorationColor: "var(--moss)", textDecorationThickness: 2 }

// Right
{ textDecorationLine: "underline", textDecorationStyle: "dotted", textDecorationColor: "var(--moss)", textDecorationThickness: 2 }
```

Same rule applies inside `onMouseEnter` / `onMouseLeave` handlers that mutate `style.textDecoration*` — never assign the shorthand if you've also assigned a longhand. Same family covers `background` vs `backgroundColor / backgroundImage`, `border` vs `borderColor / borderWidth / borderStyle`, etc.

### Window-event keyboard system

`page.tsx` has a single capture-phase keydown listener. It reads current view state from `stateRef` and dispatches custom events; views subscribe and own their own focused-index state. Common events:

- `ud-list-nav` / `ud-list-open` — Portfolio
- `ud-onboarding-day-shift` / `ud-onboarding-meeting-nav` / `ud-onboarding-history-*`
- `ud-filter-type-open` / `ud-filter-value-open` / `ud-filter-close-all`
- `ud-refresh-dashboard` — Onboarding + Pay containers subscribe and refetch
- `ud-filter-pill-state` / `ud-meeting-focused-state` / `ud-history-focused-state` — pages mirror these into refs to gate other shortcuts

When adding a new shortcut, dispatch from `page.tsx` and subscribe in the relevant view rather than threading callbacks through props.

## Deploy

The project is linked to the **Understory vibers** Vercel team (`team_OnEaZzozCh6ohnHaGzM3FIsI`); verify `.vercel/project.json` before any `vercel --prod --yes`. Default branch is `main`; we push directly (no PRs) for solo work.

## Playwright Profiles
Authenticated browser profiles are available at `.playwright/profiles/`.
Available profiles:
- cs: Filip / CS team — localhost has no auth gate, profile captured as anonymous session
Config: `.playwright/profiles.json`
To load a profile, use `playwright-cli -s={session} state-load .playwright/profiles/<role>.json` to restore cookies and localStorage.
Run `/setup-profiles` to refresh profiles. Note: prod requires real HubSpot OAuth — `.env.local` would need `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` for the OAuth flow to work.

**Synthetic keyboard input in browser tools.** When driving the app with the in-app browser tools (or any CDP-based automation), the key aliases `Down`, `Right`, `Up`, `Left`, and `Return` dispatch keydown events with a wrong or empty `e.key`, so the app's `e.key === "ArrowDown"` / `"Enter"` checks silently no-op. The app is fine; the test input is broken. Always send the full DOM key names: `ArrowDown`, `ArrowRight`, `Enter`. If a shortcut "doesn't work" under automation, instrument `window.addEventListener("keydown", ...)` and inspect `e.key` before debugging the app.

**chrome-devtools MCP vs playwright-cli.** The chrome-devtools MCP tool holds a single browser-profile lock (`~/.cache/chrome-devtools-mcp/chrome-profile`) — if another agent or session already has it open, `new_page`/`list_pages` fail with "browser is already running... Use --isolated". This recurs any time two agents in the same session both want browser automation. Don't retry chrome-devtools — fall back to `playwright-cli -s=<unique-name> open <url>` immediately, and give each concurrent agent its own `-s=` session name so they don't collide with each other either.

## Design skills in this project

impeccable, ui-ux-pro-max, emil-design-eng, design-motion-principles and gsap-animation are enabled here alongside the global understory-brand.

- Understory brand tokens are the default starting point, not a hard rule. When a design direction conflicts with them, flag the conflict and follow the direction Filip sets in the session.
- impeccable drives the process when invoked; ui-ux-pro-max, emil-design-eng and design-motion-principles are reference material; gsap-animation only for GSAP work.
