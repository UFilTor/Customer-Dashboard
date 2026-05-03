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

Customer-success dashboard for Understory's CS team. Pulls live data from HubSpot CRM and surfaces three dashboards:

- **Status** — accounts that need attention today (overdue invoices, open invoices, no upcoming events, health drops). Three variants: Daily Brief, Split, By signal (Kanban).
- **Onboarding** — meeting prep for the next 5 working days + accounts stuck past their expected step duration.
- **Pay Migration** — progress moving deals onto Understory Pay, broken down by CS owner.

Filtering is global (left pill = kind: All / Region / Person, right pill = value), except Pay Migration which uses its own Default/All toggle.

## Architecture

```
HubSpot API ──► src/lib/{hubspot,onboarding,pay-migration,attention}.ts
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

- `src/lib/hubspot-api.ts` is the REST primitive layer; the per-domain libs (`onboarding.ts`, `pay-migration.ts`, `attention.ts`, `hubspot.ts`) build view-shaped payloads from it.
- `src/lib/cache.ts` is a 15-min TTL in-memory cache used by every API route. **Cache keys include the filter** (e.g. `onboarding:${ownerIds}`) — don't share a key across filter scopes.
- `src/app/page.tsx` is the single client root. It owns dashboard + variant selection, global filter, per-variant selection memory (`selectionByScope`), the keyboard handler, and both palettes.
- `src/components/design/` is the active v2 design system. The older `src/components/*.tsx` files (SessionWrapper, ShortcutCheatSheet) are auxiliary — the dashboard renders entirely from `design/`.

### Lazy fetch pattern

Bulk endpoints stay light; heavier per-record data backfills from dedicated endpoints:

- `/api/onboarding` returns deals + meeting-only history. `/api/onboarding/history` fills calls + emails after paint. `/api/onboarding/day` fetches a single day outside the default 5-work-day window.
- `/api/companies/[id]` returns the full detail brief on click.

When you add new bulk fetches, follow the same pattern — return only what the list needs.

## Patterns to know

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

- `ud-list-nav` / `ud-list-open` — Briefing, Split, By signal, Needs attention
- `ud-onboarding-day-shift` / `ud-onboarding-meeting-nav` / `ud-onboarding-history-*`
- `ud-filter-type-open` / `ud-filter-value-open` / `ud-filter-close-all`
- `ud-refresh-dashboard` — Onboarding + Pay containers subscribe and refetch
- `ud-filter-pill-state` / `ud-meeting-focused-state` / `ud-history-focused-state` — pages mirror these into refs to gate other shortcuts

When adding a new shortcut, dispatch from `page.tsx` and subscribe in the relevant view rather than threading callbacks through props.

### Per-variant selection memory

Each Status variant (briefing / split / kanban) has its own selection slot in `selectionByScope`; non-Status dashboards share `_other`. Switching between variants brings back what was last selected there — including `null`.

## Deploy

The project is linked to the **Understory vibers** Vercel team (`team_OnEaZzozCh6ohnHaGzM3FIsI`); verify `.vercel/project.json` before any `vercel --prod --yes`. Default branch is `main`; we push directly (no PRs) for solo work.

## Playwright Profiles
Authenticated browser profiles are available at `.playwright/profiles/`.
Available profiles:
- cs: Filip / CS team — localhost has no auth gate, profile captured as anonymous session
Config: `.playwright/profiles.json`
To load a profile, use `playwright-cli -s={session} state-load .playwright/profiles/<role>.json` to restore cookies and localStorage.
Run `/setup-profiles` to refresh profiles. Note: prod requires real HubSpot OAuth — `.env.local` would need `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` for the OAuth flow to work.
