# Understory Brand Guide

## Brand Identity

**Name:** Understory
**Tagline:** "For a world of more meaningful experiences"
**Logo:** Text-based wordmark ("understory"), no separate icon. Displayed at constrained max-width with object-fit: contain.

---

## Mission & Values

**Mission:** Moving beyond a world lived through screens. Serving underserved experience makers with powerful, easy-to-use tools built on insights from 2,000+ experience businesses.

**Core philosophy:** Stories > Stuff — shifting culture from materialism to connection.

**Key principles:**
- Serving the underserved
- Danish foundation, global ambitions
- Empowerment over corporate rhetoric
- Presence and human connection over screens

---

## Audience

**Primary:** Experience creators — 900+ businesses worldwide running food tours, creative workshops, outdoor adventures, tastings, camps, and classes. People who are great at crafting experiences but need better tools to run and grow their business.

**Pain point they solve:** "Admin work is stealing time from what you do best."

---

## Voice & Tone

**Tone:** Professional and approachable. Clear, confident, grounded.

**Energy:** Calm and composed. Measured and intentional, never loud or frantic. Low-energy confidence, quiet strength. Depth over noise.

**Do:**
- Use conversational language balanced with confident positioning
- Emphasize empowerment ("You're great at creating experiences")
- Lead with pain points, then solutions
- Keep copy direct and benefit-focused

**Don't:**
- Use casual slang or overly playful language
- Use corporate jargon or aggressive sales language
- Be loud, frantic, or attention-seeking
- Over-promise or use superlatives without substance

**Example copy:**
- "You're great at creating experiences. Your booking system shouldn't be holding you back."
- "The booking system for people who hate wasting time in systems."
- "Start taking bookings today."
- "We'd love to hear from you."

---

## Color Usage

All color values are defined in `brand-tokens.json`. Key usage rules:

- **Moss (#022C12)** is the primary text color and used for all key UI surfaces. It is the dominant brand color.
- **Citrus (#F1F97E)** is used sparingly for primary CTAs, highlights, and interactive elements. Never use for large text blocks on white backgrounds (poor contrast).
- **Beige/Light Grey tones** (#F8F6ED, #EAE8DD, #EDE8D0) serve as warm background and surface colors. The brand avoids pure white backgrounds in favor of these warm neutrals.
- **Lichen (#D5DFCA) and Green 100 (#B9C2B2)** are used for secondary/muted text and inactive states.
- **Rust (#933F29)** is reserved for error states.
- **Focus Blue (#4D65FF)** is used exclusively for focus outlines (accessibility).
- Maintain a minimum contrast ratio of 4.5:1 for text on backgrounds.

---

## Typography Usage

All font specs are defined in `brand-tokens.json`. Key usage rules:

**Three typefaces form the system:**

1. **National 2 Condensed** — Used for H1, H2, H4, H6 headings. Always uppercase via `text-transform: uppercase`. Bold (700) for impact headings, Regular (400) for subtler labels (H6).

2. **PP Editorial New** — Serif display face used for H3-level headings and editorial callouts. Provides expressive contrast against the condensed sans-serif headings. Regular weight only.

3. **Inter** — Variable-weight sans-serif for all body text, UI labels, buttons, and H5. The workhorse typeface. Base size 16px, paragraph text at 18px.

**Key rules:**
- Headings are always uppercase (except H3 and H5)
- Body text uses subtle negative letter-spacing (-0.0225rem) for a refined feel
- Font rendering is always antialiased with optimizeLegibility

---

## Component Patterns

- **Buttons** use the default border-radius (0.75rem/12px), not sharp or pill-shaped
- **Primary CTA** is citrus background with moss text (bright, attention-grabbing)
- **Secondary CTA** is moss background with white text (grounded, supportive)
- **Hover states** transition to lichen background using the brand's custom cubic-bezier easing
- **Cards and surfaces** use the light-grey (#F8F6ED) background with the default border-radius
- **Borders** are minimal — depth is created through color contrast and spacing, not heavy borders

---

## Motion & Animation

The brand's motion language reflects its calm, composed personality:

- **Default easing:** `cubic-bezier(0.8, 0.24, 0.16, 1)` — a distinctive, slightly springy ease-out
- **Duration range:** 0.1s (instant feedback) to 0.6s (smooth transitions)
- Animations should feel measured and intentional, never bouncy or playful
- Scroll-triggered animations use GSAP + ScrollTrigger
- Smooth scrolling via Lenis library

---

## Technical Stack

- **Platform:** Webflow
- **Component library:** Custom-built
- **Slider:** Swiper.js
- **Smooth scroll:** Lenis
- **Animation:** GSAP + ScrollTrigger + MorphSVG
- **Fonts:** Self-hosted WOFF2 via Webflow CDN
- **Support:** Intercom widget
- **Analytics:** HubSpot, Facebook Pixel, custom Understory analytics
