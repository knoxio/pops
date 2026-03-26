# PRD-010: Responsive Foundation

> Epic: [05 — Responsive Foundation](../../epics/05-responsive-foundation.md)
> Status: To Review

## Overview

Ensure the shell and all shared components work on every viewport — from 375px phone to 1536px+ desktop. Define breakpoints, touch target minimums, page width conventions, component adaptation patterns, and empty/error state standards that all apps inherit.

## Breakpoint System

| Name | Width | Use case |
|------|-------|----------|
| `sm` | 640px | Large phones landscape |
| `md` | 768px | Tablets portrait — **primary divider** |
| `lg` | 1024px | Tablets landscape, small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large desktops |

Tailwind v4 defaults. Mobile-first CSS: base styles target mobile, `md:` prefix for desktop.

## Page Width Conventions

### Content Padding Ownership

The shell's `<main>` element has **zero padding** (`p-0`). Pages own their own padding. This avoids negative-margin hacks when full-width content (hero backdrops, poster grids, horizontal scroll rows) must bleed edge-to-edge.

**Standard page padding:** `px-4 md:px-6 lg:px-8` applied by each page to its padded sections. Full-width sections omit padding.

### Page Categories

| Category | Max width | Centering | Use when |
|----------|----------|-----------|----------|
| **Full-width** | None | N/A | Content fills available space: grids, scroll rows, data tables, hero backdrops |
| **Constrained** | `max-w-4xl mx-auto` | Centered | Text/forms that become hard to read at full width: settings, forms, detail page content |

**Rules:**
- Constrained sections must always use `mx-auto` to center — `max-w-*` without `mx-auto` creates dead space on the right, never acceptable
- Pages mix full-width and constrained sections freely (e.g., full-width hero → constrained text below)
- No page should be designed for a single viewport width

### Empty States and Error States

Both must be centered horizontally and vertically, with equal visual quality:

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

A bare red text line is not an acceptable error state. Empty states include a relevant icon, heading, description, and action.

### Page Title Icons

Page title icons must be consistent within an app — either all top-level pages have an icon next to the title, or none do. The icon should match the sidebar nav icon for that page. Drill-down pages don't need title icons (back button + breadcrumb provides context).

## Component Responsive Behaviour

| Component | Mobile (<768px) | Desktop (≥768px) |
|-----------|----------------|-------------------|
| **DataTable** | Horizontal scroll | Full table |
| **DataTableFilters** | Collapse behind a "Filters" button → opens sheet/drawer | Inline filter row |
| **Forms** | Labels stacked above inputs, full-width inputs | Side-by-side where appropriate |
| **Dialogs** | Full-screen (sheet pattern, slide up from bottom) | Centered overlay |
| **Autocomplete/Combobox** | Dropdown positioned correctly, not viewport-clipped | Standard dropdown |
| **ChipInput** | Chips wrap to multiple lines, 44px remove buttons | Inline chips |

**Approach:** CSS-driven via Tailwind responsive classes. Use `useMediaQuery` only if JavaScript behaviour must differ (e.g., swapping DataTable for card list). Prefer CSS.

## Touch Target Standards

Per Apple HIG and WCAG:
- Minimum touch target: **44x44px**
- Minimum spacing between adjacent targets: **8px**
- Applies to: buttons, links, checkboxes, chips, table rows, all interactive elements

## Business Rules

- No horizontal overflow at 375px on any page
- Mobile-first CSS: base styles are mobile, `md:` adds desktop enhancements
- All components work in light and dark mode on all viewports
- Responsive behaviour is inherited — new apps get it for free by using `@pops/ui` components

## Edge Cases

| Case | Behaviour |
|------|-----------|
| ImportWizard on mobile | Finance-specific, out of scope — power-user flow unlikely on phone |
| iPad (768-1024px) | Works naturally with `md` breakpoint |
| HomePad / wall mount | Future concern — dedicated dashboard mode, not this PRD |
| Mobile detection | No JavaScript detection — use Tailwind responsive classes |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-mobile-shell](us-01-mobile-shell.md) | Shell layout works on mobile: compact TopBar, mobile nav pattern, full-width content | Done |
| 02 | [us-02-component-audit](us-02-component-audit.md) | All @pops/ui components render without overflow at 375px: DataTable, forms, dialogs, filters | Partial |
| 03 | [us-03-touch-targets](us-03-touch-targets.md) | All interactive elements meet 44x44px minimum with 8px spacing | Yes |
| 04 | [us-04-page-conventions](us-04-page-conventions.md) | Page width, padding, empty state, error state, and title icon conventions established and documented | Done |

US-02, US-03, US-04 can parallelise after US-01.

## Verification

- No horizontal scroll at 375px on any shell page
- All `@pops/ui` components render correctly at 375px, 390px, 428px
- All touch targets ≥44x44px
- Forms stack on mobile, dialogs go full-screen, DataTable scrolls
- Constrained pages centered with `mx-auto`
- Empty states and error states follow the standard pattern
- Light and dark mode both work on mobile

## Out of Scope

- Native mobile app (Phase 5)
- PWA service worker or offline support
- App-specific page redesigns
- Mobile-specific features (swipe, pull-to-refresh)
- Performance optimisation for mobile networks
