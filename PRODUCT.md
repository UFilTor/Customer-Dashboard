## Register

product

## Users

Understory's Customer Success and Onboarding team (4 CS owners). Internal tool, used daily, primarily by Filip. Typical context: morning triage at the desk, deciding which accounts need attention today; live during/before customer calls to pull up a brief; throughout the day to track onboarding progress and pay migration. Power users — they live in this and in HubSpot.

## Product Purpose

A focused triage layer over HubSpot CRM for Understory CS. Surfaces three things the standard HubSpot UI buries: who needs attention today (overdue invoices, stalled onboarding, health drops), what's coming up in the next 5 working days (meeting prep), and pay migration progress per owner. Goal: a 30-second morning check-in that tells the team where to spend the day, plus a fast pre-meeting brief. Deep work still happens in HubSpot.

## Brand Personality

Match the Understory brand: warm, direct, casual-professional. Confident without being loud. Calm under information density. Voice in UI copy is plain, no marketing fluff, no exclamation marks. Visually quiet by default with the lime accent (#F1F97E) used sparingly for emphasis, never decoration.

## Anti-references

- **Heavy enterprise CRM** (Salesforce, HubSpot's own UI). Dense without clarity, modal-everywhere, busy chrome, status badges in every color, nothing breathes.
- **Toy-like / consumer** (Duolingo, Notion-templates aesthetic). Oversized type, candy colors, illustrations, gamification, friendly mascots.
- Generic SaaS hero-metric template (big number, small label, gradient accent stack).
- Identical card grids where every row is the same shape.

## Design Principles

1. **Glanceable today.** The dashboard answers "what needs my attention right now?" within 30 seconds of opening it. Hierarchy serves the morning triage, not feature parity with HubSpot.
2. **Keyboard fluency.** Every primary action (navigate lists, switch dashboards, filter, open detail, refresh) has a keyboard path. The mouse is optional. Shortcuts are consistent across views and platform-aware (Cmd on Mac, Ctrl elsewhere).
3. **Trust the data.** HubSpot pagination is fragile and the app caches aggressively. Never show partial or stale data silently: surface freshness, loading, and error states honestly, and prefer "loading" over "empty" when uncertain.

## Accessibility & Inclusion

Internal tool, small known user group, modern browsers. Target WCAG AA for color contrast and keyboard operability (the latter is a first-class feature here, not an accommodation). Respect `prefers-reduced-motion` for any non-essential transitions. Visible focus rings on all interactive elements. Don't rely on color alone to convey status; pair with icon, label, or position.
