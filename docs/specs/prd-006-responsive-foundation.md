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

### R2: Shell Layout & Page Content Width

**App Switcher (from PRD-003):**
- Desktop: side rail + page nav panel (already specified)
- Mobile (<768px): collapse to bottom tab bar or hamburger menu
- Decision to be made during implementation — whichever is simpler and more native-feeling on iOS

**TopBar:**
- Compact on mobile: hide user email, keep theme toggle and hamburger/menu trigger
- POPS title can shrink or become an icon

**Content area — mobile (<768px):**
- Full width (no side margins wasted)
- Appropriate padding for touch (min 16px)

**Content area — padding ownership:**

The shell's `<main>` element must have **zero padding** (`p-0`). Pages own their own padding. This avoids the negative-margin hack needed when full-width content (hero backdrops, poster grids, horizontal scroll rows) must bleed past shell-level padding.

**Standard page padding:** `px-4 md:px-6 lg:px-8` applied by each page to its padded sections. Full-width sections (heroes, grids, scroll rows) simply omit the padding.

**Example — movie detail page:**
```tsx
<div>
  {/* Hero — no padding, edge-to-edge */}
  <div className="relative h-64 md:h-96 overflow-hidden bg-muted">
    <img src={backdrop} className="absolute inset-0 w-full h-full object-cover" />
  </div>

  {/* Content — padded and constrained */}
  <div className="px-4 md:px-6 lg:px-8 max-w-4xl mx-auto space-y-6">
    <h1>{title}</h1>
    <p>{overview}</p>
  </div>
</div>
```

**Content area — desktop (≥768px), page width convention:**

Pages fall into two categories:

| Category | Max width | Centering | Use when |
|----------|----------|-----------|----------|
| **Full-width** | None | N/A | Content fills available space: grids, horizontal scroll rows, data tables, hero backdrops. E.g., Library, Discover, Watchlist (grid), History (grid), detail page heroes |
| **Constrained** | `max-w-4xl mx-auto` | Centered | Content is primarily text/forms that become hard to read at full width. E.g., Plex settings, Compare arena, detail page content below hero |

**Rules:**
- **Constrained sections must always use `mx-auto`** to center within the content area. A `max-w-*` without `mx-auto` creates dead space on the right — this is never acceptable.
- **Empty states and error states must have equal visual quality.** Both are centered horizontally and vertically, include a relevant icon (muted), a heading, a description, and an action (CTA link or retry button). A bare red text line is not an acceptable error state. The pattern:

```tsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  <AlertCircle className="h-12 w-12 text-muted-foreground/40 mb-4" />
  <p className="text-lg font-medium">Search failed</p>
  <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
  <Button variant="outline" size="sm" className="mt-4" onClick={retry}>
    Try again
  </Button>
</div>
```

- **No page should be designed for a single viewport width.** Content must adapt to the available space — grids add columns, constrained content centers, empty states center.
- **Pages mix full-width and constrained sections freely.** A detail page has a full-width hero followed by constrained text content — each section applies its own padding and width.
- **Page title icons must be consistent within an app.** Either all top-level pages in an app have an icon next to the title, or none do. Mixing (e.g., Warranties has an icon but Items doesn't) looks inconsistent. The icon should match the sidebar nav icon for that page. Drill-down pages (detail, form) don't need title icons — the back button + breadcrumb provides context.

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
1a. Constrained pages use `max-w-* mx-auto` (centered) — never `max-w-*` alone (left-aligned with dead space)
1b. Empty states are centered horizontally and vertically
1c. No page has dead space on the right at any viewport width
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
