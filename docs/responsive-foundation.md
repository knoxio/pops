# Responsive Foundation

Reference for the POPS responsive design system. Covers breakpoints, component behaviour, touch targets, and known issues.

**Epic:** [E05 — Responsive Foundation](themes/foundation/epics/05-responsive-foundation.md)
**PRD:** [PRD-006](specs/prd-006-responsive-foundation.md)

## Breakpoint System

POPS uses Tailwind CSS v4 default breakpoints. No custom breakpoints are defined.

| Breakpoint | Min Width | CSS Class Prefix | Use Case |
|-----------|----------|-----------------|----------|
| `sm` | 640px | `sm:` | Large phones (landscape) |
| `md` | 768px | `md:` | Tablets (portrait), primary mobile/desktop split |
| `lg` | 1024px | `lg:` | Tablets (landscape), small laptops |
| `xl` | 1280px | `xl:` | Desktops |

**Design approach:** Mobile-first. Base styles target phones (<640px), then layer on with responsive prefixes. The `md` breakpoint (768px) is the primary divider between mobile and desktop layouts.

**Implementation:** Use Tailwind responsive classes (`sm:`, `md:`, etc.) for layout changes. Only use `useMediaQuery` or `window.innerWidth` when JavaScript behaviour must differ (e.g. closing sidebar on mobile nav click). Prefer CSS-driven responsiveness.

## Shell Layout

The shell layout adapts at the `md` (768px) breakpoint.

### TopBar (`apps/pops-shell/src/app/layout/TopBar.tsx`)

| Property | Mobile (<768px) | Desktop (>=768px) |
|----------|----------------|-------------------|
| Height | `h-14` (56px) | `md:h-16` (64px) |
| Padding | `px-3` | `md:px-4` |
| Title | `text-lg` | `md:text-xl` |
| User email | Hidden (`hidden md:block`) | Visible |
| Button spacing | `gap-1` | `md:gap-4` |
| Position | `sticky top-0 z-40` | Same |

All interactive elements (hamburger, theme toggle) use `min-w-[44px] min-h-[44px]` for touch targets.

### Sidebar (`apps/pops-shell/src/app/layout/Sidebar.tsx`)

| Property | Mobile (<768px) | Desktop (>=768px) |
|----------|----------------|-------------------|
| Style | Overlay with backdrop | Fixed, pushes content |
| Position | `fixed top-0 left-0 h-full z-50` | `fixed md:top-16 md:h-[calc(100vh-4rem)]` |
| Backdrop | `bg-black/50` overlay (tappable to close) | None |
| Close | X button + backdrop tap + nav link click | Hamburger toggle only |
| Width | `w-64` (256px) | Same |
| Nav link height | `py-3 min-h-[44px]` | `md:py-2` |
| POPS header | Shown with close button | Hidden (`md:hidden`) |

The sidebar closes on mobile when a nav link is clicked (`window.innerWidth < 768`).

### Content Area (`apps/pops-shell/src/app/layout/RootLayout.tsx`)

| Property | Mobile (<768px) | Desktop (>=768px) |
|----------|----------------|-------------------|
| Width | Full width (`ml-0`) | Pushed by sidebar (`md:ml-64` when open) |
| Padding | `p-4` (16px) | `md:p-6` (24px) |
| Sidebar effect | Overlays, no content shift | Pushes content right |
| Min width | `min-w-0` (prevents overflow) | Same |
| Transition | `duration-300` | Same |

### UI Store (`apps/pops-shell/src/store/uiStore.ts`)

Sidebar state is persisted to localStorage via Zustand. Default is `sidebarOpen: true`. On mobile, the sidebar closes after navigation.

## Component Responsive Behaviour

### DataTable (`packages/ui/src/components/DataTable.tsx`)

Tables use **horizontal scroll** on mobile. The table container allows overflow scrolling when content exceeds viewport width. No card/list view alternative is provided — horizontal scroll is the current pattern.

**Toolbar:** Stacks vertically on mobile, side-by-side on desktop (`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`). Search input is full-width on mobile (`w-full sm:max-w-sm`).

**Pagination:** Stacks vertically on mobile (`flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`). "Rows per page" label is hidden on mobile (`hidden sm:block`).

### DataTableFilters (`packages/ui/src/components/DataTableFilters.tsx`)

**Mobile collapse:** On mobile (<768px), filters are hidden behind a toggle button with a `SlidersHorizontal` icon. An active filter count badge shows when filters are applied. On desktop (>=768px), filters are always visible. The toggle uses `useState` (`mobileOpen`) and CSS classes (`hidden md:grid`).

The filter grid adapts across breakpoints:

| Viewport | Grid Columns | Class |
|----------|-------------|-------|
| <640px | 1 column (stacked) | Default |
| >=640px | 2 columns | `sm:grid-cols-2` |
| >=1024px | 3 columns | `lg:grid-cols-3` |

**Range filters** (date, number) stack vertically on mobile:
- Mobile: Inputs full-width, stacked (`flex-col`)
- Desktop: Side-by-side (`sm:flex-row sm:items-center`) with "to" label shown (`hidden sm:block`)
- Date inputs: `w-full sm:w-38`
- Number inputs: `w-full sm:w-25`

**Text filters** use `w-full sm:max-w-sm` — full width on mobile, constrained on desktop.

**Clear all** button: `size="default"` with `px-3`.

### Dialog (`packages/ui/src/primitives/dialog.tsx`)

| Property | Mobile (<768px) | Desktop (>=768px) |
|----------|----------------|-------------------|
| Layout | Full-screen (`inset-0 rounded-none`) | Centered overlay (`md:max-w-lg md:rounded-lg`) |
| Position | Fixed, fills viewport | `md:top-1/2 md:left-1/2 md:-translate-x/y-1/2` |
| Animation | Fade in/out | Zoom + fade |
| Header text | Centered (`text-center`) | Left-aligned (`sm:text-left`) |
| Footer buttons | Stacked, reversed (`flex-col-reverse`) | Row layout (`sm:flex-row sm:justify-end`) |

On mobile, dialogs fill the entire screen for maximum usability. The footer button order is reversed so the primary action appears at the bottom (natural thumb position).

### Forms

All form inputs (TextInput, NumberInput, DateTimeInput, Select) support three size variants:

| Size | Height | Class | Touch Target |
|------|--------|-------|-------------|
| `sm` | 36px | `h-9` | Below minimum |
| `default` | 40px | `h-10` | Near minimum |
| `lg` | 44px | `h-11` | Meets 44px standard |

Forms should use the `default` or `lg` size variant on touch-focused pages. Inputs stretch to full width by default.

### ChipInput (`packages/ui/src/components/ChipInput.tsx`)

- Container uses `flex flex-wrap` — chips wrap to new lines on narrow viewports
- Minimum container height: `min-h-10` (40px)
- Input maintains `min-w-30` so it remains usable even with many chips
- Chips use `size="sm"` with adequate padding for tap targets

### Autocomplete / ComboboxSelect

- Popover width matches trigger: `w-[var(--radix-popover-trigger-width)]`
- Positioned `side="bottom" align="start"` to prevent viewport clipping
- Multi-select chips wrap with `flex flex-wrap gap-2`
- Command list items use `py-2.5 min-h-11` (44px) for touch targets

## Touch Target Standards

Per Apple HIG and WCAG 2.5.8:

| Standard | Value |
|----------|-------|
| Minimum touch target size | 44x44px |
| Minimum spacing between targets | 8px (`gap-2`) |

### Implementation by Component

| Component | Touch Target Approach |
|-----------|---------------------|
| **Buttons** | `lg` variant = `h-11` (44px). `default` = `h-10` (40px). Icon buttons = `h-10 w-10` |
| **Nav links** | `min-h-[44px]` with `py-3` on mobile, `md:py-2` on desktop |
| **Hamburger / Theme toggle** | `min-w-[44px] min-h-[44px]` explicit |
| **Sidebar close** | `min-w-[44px] min-h-[44px]` explicit |
| **Command items** (dropdowns) | `py-2.5 min-h-11` (44px) |
| **Form inputs** | `h-10` (default) or `h-11` (lg) |
| **Chip remove buttons** | `min-w-[32px] min-h-[32px]` explicit sizing |

### Spacing

Interactive elements are separated by `gap-2` (8px) minimum throughout the component library. Common spacing classes:
- `gap-1.5` / `gap-2` — within tight groups (chip collections)
- `gap-2` — standard spacing between interactive elements
- `gap-4` — spacing between groups or larger controls
- `space-y-1` — vertical nav item spacing
- `space-y-4` — section spacing

## Dark Mode

Both light and dark themes work on all viewports. The theme system uses oklch color space for perceptually consistent colours. Theme toggle is accessible on all screen sizes (always visible in TopBar).

## Known Issues and Future Work

### Known Limitations

1. **Sidebar default state:** `sidebarOpen` defaults to `true` and is persisted to localStorage. First-time mobile users see the sidebar overlay immediately. A future improvement could default to closed on mobile using a window width check in the store initialiser.

2. **DataTable column hiding:** No automatic column hiding on mobile. Tables rely on horizontal scroll. A future enhancement could hide less important columns at narrower breakpoints.

3. **Button `sm` variant:** At `h-9` (36px), the small button variant is below the 44px touch target minimum. Use `default` or `lg` for touch-focused interfaces.

4. **Form input `sm` variant:** At `h-9` (36px), also below minimum. Prefer `default` (`h-10`) or `lg` (`h-11`) on touch interfaces.

### Not in Scope

- Native mobile app
- PWA service worker / offline support
- App-specific page redesigns (e.g., ImportWizard mobile layout)
- Mobile-specific gestures (swipe, pull-to-refresh)
- iPad / HomePad dedicated layouts
- Performance optimisation for mobile networks

## Quick Reference for New Apps

When building a new app module for POPS, follow these patterns to inherit responsive behaviour:

1. **Use `@pops/ui` components** — they handle responsive layout automatically
2. **Use Tailwind responsive classes** — `sm:`, `md:`, `lg:` prefixes
3. **Default size = touch-safe** — use `default` or `lg` size variants for interactive elements
4. **Mobile-first CSS** — write base styles for mobile, add desktop overrides
5. **Test at 375px** — the minimum supported viewport width
6. **Full-width on mobile** — avoid fixed-width containers below `md` breakpoint
7. **Stack on mobile** — use `flex-col sm:flex-row` for side-by-side layouts
8. **`min-w-0` on flex children** — prevents content from overflowing its container
