---
name: Understory Customer Dashboard
description: A warm, calm triage layer over HubSpot for Understory's CS team.
colors:
  moss: "#022C12"
  dark-moss: "#1D261F"
  citrus: "#F1F97E"
  page-bg: "#EAE8DD"
  card-bg: "#F8F6ED"
  beige: "#EDE8D0"
  beige-gray: "#D3D1C6"
  light-grey: "#F3F3F3"
  light-grey-2: "#DBD8CE"
  lichen: "#D5DFCA"
  green-muted: "#B9C2B2"
  green-100: "#7A8A72"
  lilac: "#D1BEE7"
  sky-blue: "#CFE8FF"
  rust: "#933F29"
  red: "#7E0C04"
  focus-blue: "#4D65FF"
  hairline: "#022C1214"
  hairline-strong: "#022C1224"
typography:
  display:
    fontFamily: "Oswald, 'National 2 Condensed', Impact, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.005em"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.06em"
  editorial:
    fontFamily: "Fraunces, 'PP Editorial New', Georgia, serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.3
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "10.5px"
    fontWeight: 500
    lineHeight: 1
rounded:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.page-bg}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.dark-moss}"
    textColor: "{colors.page-bg}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.green-100}"
    rounded: "{rounded.md}"
    padding: "5px 12px"
  button-ghost-hover:
    textColor: "{colors.moss}"
  chip:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.moss}"
    rounded: "{rounded.lg}"
    padding: "7px 14px"
    typography: "{typography.title}"
  chip-active:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.page-bg}"
  pill-meta:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.moss}"
    rounded: "{rounded.sm}"
    padding: "3px 7px"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.card-bg}"
    rounded: "{rounded.xl}"
    padding: "14px"
  input-search:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.moss}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    typography: "{typography.body}"
---

# Design System: Understory Customer Dashboard

## 1. Overview

**Creative North Star: "The Quiet Operator's Desk"**

Imagine a workshop notebook left open on a warm linen desk: ink, paper, one highlighter, no clutter. The dashboard is dense with information but never feels busy. The eye finds the day's signal in seconds, then drops into detail without leaving the page. Color is rare and earned. Type does most of the work. The whole surface breathes the Understory voice: warm, direct, calm under load.

Everything serves morning triage and pre-meeting brief. The interface is the inverse of the HubSpot UI it complements: fewer surfaces, fewer badges, fewer modals. Where HubSpot stacks dense chrome around thin content, this stacks thin chrome around dense content. The lime accent (`#F1F97E`) is the only loud thing in the room, and it speaks once per screen.

**Key Characteristics:**
- Warm cream page (`#EAE8DD`), warmer cream cards (`#F8F6ED`). Never pure white.
- One accent: lime citrus, used as a wipe highlight, kbd hint, or single confirmation, never as decoration.
- Three voices in type: Inter for everything, Oswald for big numbers/headers, Fraunces italic for soft asides, JetBrains Mono for keyboard hints.
- Flat by default. Borders are 1px hairlines (`rgba(2,44,18,0.08)`). One small drop shadow on the active segmented control, nothing else.
- Keyboard is first-class: visible blue focus ring, `kbd` pills inline in copy, command palette on `Cmd+K`.

## 2. Colors

A warm, slightly green-tinted palette that reads as paper, ink, and one highlighter. Saturation is restrained everywhere except `--citrus`, which is the single point of voltage.

### Primary
- **Moss** (`#022C12`): The ink. All primary text, primary buttons, active chips, and the inset focus stripe on selected list rows. Treat it as black; never use `#000`.
- **Citrus** (`#F1F97E`): The highlighter. Reserved for the wipe-in moment on the brief headline, the keyboard-hint background, and rare confirmation flashes. Never decorative.

### Secondary
- **Dark Moss** (`#1D261F`): Hover state for primary moss elements. Slightly warmer than pure moss.
- **Green-100** (`#7A8A72`): Muted secondary text, inactive chip labels, sub-axis labels in charts.
- **Green Muted** (`#B9C2B2`): Tertiary text, scrollbar hover, soft separators.

### Tertiary (data-viz palette)
Used for category swatches, sparklines, and row tints. Selected by hue, not by status.
- **Lichen** (`#D5DFCA`): Default category green.
- **Lilac** (`#D1BEE7`): Secondary category.
- **Sky Blue** (`#CFE8FF`): Tertiary category.
- **Beige** (`#EDE8D0`): Quaternary category and soft callout backgrounds.
- **Rust** (`#933F29`): Warning text and warning sparkline.
- **Red** (`#7E0C04`): Error / overdue text. Never as a fill larger than 8px.

### Neutral (warm cream stack)
- **Page BG** (`#EAE8DD`): The desk surface. The whole window.
- **Card BG** (`#F8F6ED`): The paper. All cards, search fields, hover row backgrounds, dropdown surfaces.
- **Light Grey** (`#F3F3F3`): The cool fallback grey for utility chrome only.
- **Beige Gray** (`#D3D1C6`): Borders on chips, soft section dividers.
- **Light Grey 2** (`#DBD8CE`): Disabled surfaces, sparkline grid lines.
- **Hairline** (`rgba(2,44,18,0.08)`): The default 1px divider. Tinted toward moss, never neutral grey.
- **Hairline Strong** (`rgba(2,44,18,0.14)`): Scrollbar thumb, hover dividers.

### State
- **Focus Blue** (`#4D65FF`): The keyboard focus ring. The only saturated blue in the system. Never used as a content color.

### Named Rules

**The One Lime Rule.** `--citrus` appears at most once per visible viewport. If you find yourself adding a second citrus surface, remove the first or use a hairline instead.

**The No White Rule.** `#FFFFFF` is forbidden as a page or card background. Cards live on `--card-bg`; the page lives on `--page-bg`. The single exception is the active segmented-control thumb, which uses `#fff` to lift off the cream track.

**The Tinted Hairline Rule.** Every divider tints toward moss (`rgba(2,44,18,0.08)`). Pure-grey borders are forbidden because they read cold against cream surfaces.

## 3. Typography

**Display Font:** Oswald (with National 2 Condensed, Impact fallback).
**Body Font:** Inter (with system-ui fallback). The Understory brand font.
**Editorial Font:** Fraunces (with PP Editorial New, Georgia fallback). Italic only.
**Mono Font:** JetBrains Mono. Used exclusively for keyboard hints.

**Character:** Inter does ~95% of the work, calmly. Oswald shows up for big condensed numbers and the metric strip. Fraunces italic appears in rare soft asides, the way a pencil note in the margin would. JetBrains Mono only ever lives inside a `kbd` pill.

### Hierarchy
- **Display** (Oswald, 700, 22px, line-height 1.1): Big numbers in metric strips, hero counts.
- **Headline** (Inter, 700, 15px): Recap card titles, section headers within views.
- **Title** (Inter, 600, 13px): Row primary text, button labels, chip labels, table headers.
- **Body** (Inter, 400, 13px, letter-spacing -0.005em): Default reading size. The whole app sits at 13px; do not raise it without reason.
- **Caption / Sub** (Inter, 400-500, 11-11.5px, color green-100): Row secondary text, helper copy, dropdown descriptions.
- **Label** (Inter, 700, 10px, letter-spacing 0.06em, UPPERCASE): Section eyebrows, chart axis labels, tab uppercase markers.
- **Editorial** (Fraunces italic, 400, 11px): Single-purpose soft asides such as the "default" filter footnote. Never for a heading.
- **Mono / kbd** (JetBrains Mono, 500, 10.5px): Keyboard hints inside `kbd` pills only.

### Named Rules

**The 13px Floor Rule.** Body type sits at 13px. Going smaller (down to 10px) is allowed for labels and captions; going bigger requires a deliberate purpose, not stylistic preference.

**The Letter-Spacing Pull Rule.** Body and headline carry `letter-spacing: -0.005em` to match the Understory brand and tighten Inter at small sizes. Labels go the other way (`+0.06em` uppercase). Mid-weights stay neutral.

**The Editorial Sparingly Rule.** Fraunces italic appears at most once per view, as a soft aside. Forbidden as a heading or button face.

## 4. Elevation

Flat by default. The dashboard relies on tonal layering (cream page, warmer cream cards, moss ink) and 1px hairlines for depth. Three elevation moments exist, all functional: the focus ring (a 2px blue outline with a 2px offset), the active segmented-control thumb (a 1px shadow lifting it off the track), and transient floating surfaces (cmd palette, dropdown menus, toasts, cheat sheet) that need to read as above the desk. Everything else stays on the same plane.

### Shadow Vocabulary
- **Lift, micro** (`box-shadow: 0 1px 2px rgba(0,0,0,0.04)`): Active segmented-control thumb only.
- **Modal lift** (`box-shadow: var(--shadow-modal)` = `0 8px 24px rgba(2,44,18,0.12)`): Cmd palette, dropdown menus, toast, cheat sheet. Only on transient floating surfaces, never on cards or rows at rest.
- **Focus ring** (`outline: 2px solid var(--focus-blue); outline-offset: 2px`): Every keyboard-focused interactive element. Not a shadow, but functions as the elevation cue.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. If a card needs separation, use a hairline border or a tonal step (page → card), never a drop shadow.

**The No Hover Lift Rule.** Hover states change background tint or text color. They never raise the element with a shadow or transform.

## 5. Components

### Buttons
- **Shape:** 8-10px radius (`{rounded.md}` for primary, `{rounded.lg}` for prominent CTAs). Never fully rounded except keyboard-hint pills.
- **Primary:** Moss (`#022C12`) background, page-bg text, padding `8px 14px`, title type. Hover swaps to dark-moss.
- **Ghost / Segmented:** Transparent at rest, green-100 text. Hover/active flips to moss. The active variant in a segmented control uses `#fff` background with the micro-lift shadow.
- **Focus:** Blue outline ring with 2px offset, identical for every interactive element. Never replaced per-component.

### Chips (filter pills)
- **Style:** Card-bg fill, moss text, 10px radius, `7px 14px` padding, title type at 13px/600.
- **Active:** Moss fill, page-bg text. No icon shift, no shadow, just the tonal flip.
- **Pill-meta** (small inline metadata pill): hairline background tint, 6px radius, 3px/7px padding, 10px label type uppercase.

### Cards
- **Corner Style:** 14px radius (`{rounded.xl}`).
- **Background:** `--card-bg` (`#F8F6ED`).
- **Border:** 1px hairline (`rgba(2,44,18,0.08)`). No shadow.
- **Internal Padding:** `14px` standard; `14px 14px 13px` when the bottom houses a tighter row.
- **No nested cards.** A card may contain rows, dividers, and sub-sections, but never another card-bg surface.

### Inputs / Search fields
- **Style:** Card-bg fill on page-bg surface, 10px radius, `8px 12px` padding, body type.
- **Focus:** Standard blue outline ring (no border swap, no inner glow).
- **Numeric input:** Never use `<input type="number">`. The browser-rendered spinner arrows can't be styled cleanly across browsers and clash with the flat hairline aesthetic. Use `<input type="text" inputMode="numeric" pattern="[0-9]*">` with manual sanitization in `onChange`. Reference: pagination jump-input in `PortfolioView.tsx`.

### Lists / Rows
- **Hover:** background → `--light-grey` over 120ms ease (`.hrow`).
- **Focused (keyboard):** background → `--light-grey` plus a 3px inset moss stripe on the leading edge. The stripe is the row's selected affordance and lives only here, never on cards.
- **Hairline divider** between rows. No alternating row tints.

### Navigation / TopBar
- **Style:** Page-bg surface, no full-width border. Section logo + dashboard chip group on the left, view variant chips on the right, profile/refresh chips at the far right.
- **Active dashboard:** chip flips to moss/citrus accent or moss/page-bg, depending on context. Inactive chips use card-bg.

### Keyboard pill (`kbd`)
- **Style:** `2px 5px` padding, 4px radius, mono 10.5px, moss text on a 6%-moss background, 1px hairline border. Inline with body copy. The single most distinctive component in the system.

### Citrus wipe (signature animation)
- **Style:** A horizontal lime swipe (`citrusWipe`, 520ms cubic-bezier(0.22, 1, 0.36, 1)) painted under a key word in a heading, e.g. the brief title. Once per page load. The brand's only flourish.

## 6. Do's and Don'ts

### Do:
- **Do** keep the page on `--page-bg` (`#EAE8DD`) and cards on `--card-bg` (`#F8F6ED`). Pure `#fff` is reserved for the segmented-control thumb.
- **Do** use moss (`#022C12`) for all primary text and primary buttons, and treat it as the project's black.
- **Do** reserve `--citrus` (`#F1F97E`) for one moment per viewport: a wipe highlight, a kbd hint, or a single confirmation flash.
- **Do** sit body type at 13px Inter with `letter-spacing: -0.005em`. Promote to Oswald 22px only for actual numerical heroes in the metric strip.
- **Do** divide content with 1px hairlines tinted toward moss (`rgba(2,44,18,0.08)`).
- **Do** show a visible blue focus ring (`#4D65FF`, 2px, 2px offset) on every interactive element. The keyboard is a first-class user.
- **Do** ease motion with `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart family). Durations stay between 120ms and 220ms.
- **Do** respect `prefers-reduced-motion`: collapse all animation durations to ~0.
- **Do** pair color status with an icon, label, or position. Never rely on color alone.

### Don't:
- **Don't** use `#FFFFFF` as a page or card background, and never `#000` as text.
- **Don't** scatter citrus around the screen. A second citrus surface in view violates The One Lime Rule.
- **Don't** use a colored side stripe wider than 1px on cards or rows. The 3px moss stripe is reserved for the focused list row only.
- **Don't** add gradient text (`background-clip: text`), gradient buttons, or gradient surfaces. The system has no gradients.
- **Don't** apply drop shadows to cards, dialogs, popovers, or hover states. Use a hairline or a tonal step instead.
- **Don't** build the heavy enterprise-CRM look: stacked colored badges, modal-everywhere flows, busy chrome around thin content. PRODUCT.md names this anti-reference; reject it visibly.
- **Don't** drift toward the toy-like consumer aesthetic: oversized type, candy colors, illustration mascots, gamification. PRODUCT.md names this anti-reference; reject it visibly.
- **Don't** ship the generic SaaS hero-metric template (big number, small label, gradient accent, supporting stat row). The metric strip is allowed only because it sits inside a working brief, not as the page's hero.
- **Don't** use identical card grids where every row is the same shape. Vary card density and content; let rhythm carry hierarchy.
- **Don't** introduce a new font family. Inter, Oswald, Fraunces italic, JetBrains Mono. That's the stack.
- **Don't** open a modal where an inline disclosure or detail panel works. The split view and command palette already cover most needs.
- **Don't** use em dashes in UI copy. Commas, colons, semicolons, periods, parentheses.
