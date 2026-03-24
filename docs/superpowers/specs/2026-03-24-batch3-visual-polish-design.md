# Batch 3: Visual Polish

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Information density, empty/loading states, subtle animations, desktop minimum width

---

## 1. Information Density

**Goal:** Tighten spacing so more content is visible without scrolling.

### Layout
- Remove `max-w-6xl` (1152px) fixed width. Replace with `max-w-7xl` (1280px) as a soft cap with auto margins. Content fills available space on most screens, centers on ultrawide.
- Reduce main content vertical padding from `py-6` to `py-4`.

### Metric Cards
- Reduce card padding from `p-4` to `p-3`.
- Reduce value text from `text-xl` to `text-lg`.
- Keep label size as-is (`text-xs uppercase`).

### Company Header
- Reduce bottom margin from `mb-4` to `mb-3`.
- Reduce metric cards bottom margin from `mb-6` to `mb-4`.

### Attention Groups
- Already tightened in previous work. No further changes.

---

## 2. Empty & Loading States

**Goal:** Add visual cues to empty states so they feel intentional, not broken.

### Attention List "All Clear"
- Add a simple checkmark circle icon (SVG, moss green) above the existing "All clear" / "No accounts need your immediate attention" text.
- Center the icon + text block vertically with some padding.

### Activity Tab Empty (filtered)
- Add a small filter/funnel icon (SVG, muted gray) above "No activities match the current filters".

### Search Empty
- Already has "No companies found" / "No recent companies" text. Keep as-is.

### Loading Skeletons
- Already use `animate-pulse` and match the border style. No changes needed.

---

## 3. Subtle Animations

**Goal:** Add minimal motion to make transitions feel smooth without slowing down the workflow.

### Content Fade-In
- Add a `fadeIn` keyframe animation to `globals.css`:
  ```css
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fadeIn {
    animation: fadeIn 200ms ease-out;
  }
  ```
- Apply `animate-fadeIn` to:
  - The attention list container when data loads
  - The company detail section when it appears
  - Each attention group (stagger not needed, just fade the whole block)

### Snooze Popover
- Add `animate-fadeIn` to the popover container (currently appears instantly).

### Keyboard Shortcut Cheat Sheet
- Backdrop: fade in opacity over 150ms.
- Modal: scale from 0.95 to 1.0 + fade in over 150ms.
- Add CSS:
  ```css
  @keyframes modalIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
  .animate-modalIn {
    animation: modalIn 150ms ease-out;
  }
  ```

### Activity Expand/Collapse
- Currently the full content section appears/disappears instantly.
- Wrap in a CSS transition: `transition: max-height 200ms ease-out, opacity 200ms ease-out`.
- Implementation note: CSS max-height transitions require a fixed max-height value. Simpler approach: just add `animate-fadeIn` to the expanded content div when it appears. No collapse animation needed (instant hide is fine).

### Hover States
- Already using `transition-all duration-200` / `duration-150` throughout. No changes needed.

---

## 4. Desktop Minimum Width (1024px)

**Goal:** Ensure nothing breaks or looks crushed on smaller desktop windows.

### Metric Cards
- Change grid from fixed 5-column to responsive: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`.
- Cards wrap to 2-3 columns on narrower screens instead of getting tiny.

### Overview Info/Deal Cards
- Change from `grid-cols-2` to `grid-cols-1 lg:grid-cols-2`.
- Stack to single column below ~1024px.

### Nav Search Bar
- Reduce `max-w-md` (448px) to `max-w-sm` (384px) on smaller screens.
- Use responsive class: `max-w-sm lg:max-w-md`.

### General
- Test that no horizontal scrollbar appears at 1024px viewport width.
- Ensure text doesn't overflow or get clipped in company rows at narrow widths.

---

## Technical Notes

### No New Dependencies
All changes are CSS/Tailwind classes. No new packages.

### Files to Modify
- `globals.css` - Add fadeIn and modalIn keyframe animations
- `src/app/page.tsx` - Update max-width, padding, add fadeIn classes
- `src/app/preview/page.tsx` - Same layout updates
- `src/components/MetricCards.tsx` - Responsive grid, tighter padding
- `src/components/CompanyHeader.tsx` - Tighter margins
- `src/components/AttentionList.tsx` - Add fadeIn, empty state icon
- `src/components/ActivityTab.tsx` - Empty state icon, expand fadeIn
- `src/components/ShortcutCheatSheet.tsx` - Modal animation
- `src/components/SnoozePopover.tsx` - Popover fadeIn
- `src/components/OverviewTab.tsx` - Responsive grid
- `src/components/SearchBar.tsx` - Responsive search width

### No New Components
All changes modify existing files. No new components needed.

### Testing
- Visual verification only. No unit tests needed for CSS changes.
- Check at 1024px, 1280px, and 1920px viewport widths.
