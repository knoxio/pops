# PRD-006: Responsive Foundation

**Epic:** [05 — Responsive Foundation](../themes/foundation/epics/05-responsive-foundation.md)
**Theme:** Foundation
**Status:** Approved
**Depends on:** PRD-001 (UI library), PRD-002 (shell), PRD-003 (app switcher)

## Problem Statement

The current PWA is built for desktop viewports. As POPS targets iPhone as a daily driver (and eventually iPad/HomePad), the shell and shared components need to work on mobile. This isn't a mobile-first redesign — it's a pass to ensure nothing is broken or unusable on small screens.

## Goal

Every screen in the shell and `@pops/ui` components should be functional on a 375px viewport. Not pixel-perfect mobile design — usable and not broken. Establish responsive patterns that new apps inherit automatically.

## Requirements

### R1: Breakpoint System

Define standard breakpoints in the `@pops/ui` design tokens:

| Name | Width | Use case |
|------|-------|----------|
| `sm` | 640px | Large phones landscape |
| `md` | 768px | Tablets portrait |
| `lg` | 1024px | Tablets landscape, small laptops |
| `xl` | 1280px | Desktops |

These are Tailwind v4 defaults. No need to customise unless a specific breakpoint is missing. Document them as the standard set.

### R2: Shell Layout — Mobile

**App Switcher (from PRD-003):**
- Desktop: side rail + page nav panel (already specified)
- Mobile (<768px): collapse to bottom tab bar or hamburger menu
- Decision to be made during implementation — whichever is simpler and more native-feeling on iOS

**TopBar:**
- Compact on mobile: hide user email, keep theme toggle and hamburger/menu trigger
- POPS title can shrink or become an icon

**Content area:**
- Full width on mobile (no side margins wasted)
- Appropriate padding for touch (min 16px)

### R3: Shared Component Audit

Each `@pops/ui` component checked at 375px:

**DataTable:**
- Horizontal scroll for tables wider than viewport
- Or: card/list view for mobile (show key fields, expandable)
- Column hiding at breakpoints (hide less important columns on mobile)
- Decision: start with horizontal scroll (simpler), add card view later if needed

**Forms (TextInput, NumberInput, DateTimeInput, CheckboxInput, RadioInput):**
- Stack labels above inputs on mobile (not side-by-side)
- Inputs stretch to full width
- Touch-friendly input sizes (min height 44px)

**Dialogs/Modals:**
- Full-screen on mobile (<768px)
- Slide up from bottom (sheet pattern) if feasible, otherwise full-screen overlay

**Autocomplete/ComboboxSelect:**
- Dropdown positioned correctly on mobile (not clipped by viewport)
- Touch-friendly option sizes

**ChipInput:**
- Chips wrap to multiple lines
- Remove button touch target ≥44px

**DataTableFilters:**
- Collapse into a "Filters" button that opens a sheet/drawer on mobile
- Not a row of inline filter dropdowns (doesn't fit)

### R4: Touch Target Standards

Per Apple HIG and WCAG:
- Minimum touch target: 44x44px
- Minimum spacing between targets: 8px
- Apply to all interactive elements: buttons, links, checkboxes, chips, table rows

### R5: Testing

- Visual verification at 375px, 390px, 428px (common iPhone sizes) in Chrome DevTools
- Verify on actual iPhone if possible (Safari rendering differences)
- No automated responsive tests required (visual verification is sufficient for this pass)
- Document any known issues that require deeper redesign (out of scope for this PRD, tracked for future work)

## Out of Scope

- Native mobile app
- PWA service worker improvements
- Offline support
- App-specific page redesigns (finance pages layout is finance's problem)
- Mobile-specific features (swipe gestures, pull-to-refresh)
- Performance optimisation for mobile networks

## Acceptance Criteria

1. Shell layout works on 375px+ viewports without horizontal scroll
2. App switcher has a mobile interaction pattern (bottom bar or hamburger)
3. All `@pops/ui` components render without overflow/clipping at 375px
4. Touch targets meet 44x44px minimum on all interactive elements
5. Forms stack vertically on mobile
6. DataTable scrolls horizontally or adapts on mobile
7. Dialogs are full-screen on mobile
8. DataTableFilters collapse on mobile
9. Dark and light mode both work on mobile
10. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` all pass

## Edge Cases & Decisions

**Q: Should we add a mobile detection hook?**
A: No. Use Tailwind responsive classes (`md:`, `lg:`) for layout. Use `useMediaQuery` only if JavaScript behaviour needs to differ (e.g., swapping DataTable for a card list). Prefer CSS-driven responsiveness.

**Q: What about the ImportWizard on mobile?**
A: The ImportWizard is finance-specific (lives in `@pops/app-finance`). Making it mobile-friendly is out of scope for this PRD. It's a power-user flow unlikely to be used on a phone.

**Q: iPad / HomePad layout?**
A: iPad (768–1024px) should work naturally with the `md` breakpoint. HomePad is a future concern — likely a dedicated dashboard mode, not the standard app layout.

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` all pass.

### US-1: Mobile shell layout
**As a** user on iPhone, **I want** the shell layout to be usable on my screen **so that** I can navigate POPS without pinching/scrolling horizontally.

**Acceptance criteria:**
- TopBar compact on mobile
- App switcher works on mobile (bottom bar or hamburger)
- Content area full-width with appropriate padding
- No horizontal overflow at 375px

### US-2: Responsive shared components
**As a** user on iPhone, **I want** tables, forms, and dialogs to be usable **so that** I can interact with data on a small screen.

**Acceptance criteria:**
- DataTable horizontal scroll on mobile
- Forms stack vertically, full-width inputs
- Dialogs full-screen on mobile
- Autocomplete/Combobox positioned correctly
- ChipInput wraps, touch-friendly remove buttons

### US-3: Touch target audit
**As a** user on a touch device, **I want** all interactive elements to be easy to tap **so that** I don't accidentally hit the wrong thing.

**Acceptance criteria:**
- All buttons, links, checkboxes, chips meet 44x44px minimum
- Minimum 8px spacing between adjacent targets
- DataTableFilters collapsed behind a button on mobile

### US-4: Responsive documentation
**As a** developer building a new app, **I want** responsive patterns documented **so that** my app is mobile-friendly from day one.

**Acceptance criteria:**
- Breakpoint system documented
- Component responsive behaviour documented (how DataTable, forms, dialogs adapt)
- Touch target standards documented
- Any known issues or future work noted
