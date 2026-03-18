# PRD-003: App Switcher

**Epic:** [02 — Shell Extraction](../themes/foundation/epics/02-shell-extraction.md)
**Theme:** Foundation
**Status:** Approved
**Depends on:** PRD-002 (shell must exist with basic sidebar)

## Problem Statement

PRD-002 delivers a minimal sidebar that shows nav items for the active app. As POPS grows to 5+ apps, users need a way to switch between apps and navigate within them. The current flat nav list doesn't scale.

## Goal

Design and implement a two-level navigation system: app selection (top-level) and page navigation (within the active app). Should feel natural with one app and scale gracefully to ten.

## Requirements

### R1: Navigation Structure

Two distinct levels:

1. **App rail** — Always visible. Shows icons for all registered apps. Highlights the active app. Clicking switches to that app's routes.
2. **Page nav** — Shows the pages within the active app. Expands from the app rail or displays alongside it.

### R2: App Registration

Each app package exports a `navConfig`:

```typescript
interface AppNavConfig {
  id: string           // 'finance', 'media', 'inventory'
  label: string        // 'Finance'
  icon: string         // Lucide icon name or component
  basePath: string     // '/finance'
  items: AppNavItem[]
}

interface AppNavItem {
  path: string         // Relative to basePath. '' for index.
  label: string
  icon: string
}
```

The shell maintains a registry of all app configs. Adding a new app to the switcher = importing its navConfig and adding it to the registry array.

### R3: Interaction Patterns

**Design reference:** Discord's server selection rail. Vertical strip of icons, single tap to switch context, active indicator, page list expands alongside. Scales from 1 to 50 without redesign.

**Desktop (≥1024px):**
- App rail is a narrow vertical strip on the left (icon-only, ~64px wide)
- Active app has a visual pill/indicator (similar to Discord's left-edge indicator)
- Single click switches context — page nav panel (~200px) immediately shows that app's pages
- Hover on inactive app shows tooltip with app name
- Rail can be collapsed entirely via toggle (persisted in uiStore)

**Tablet (768–1023px):**
- Same as desktop but page nav collapses by default, opens as overlay on app icon click

**Mobile (<768px):**
- Bottom tab bar with app icons (max 5 visible, overflow into "more" menu)
- Page nav as a horizontal scroll or dropdown from the top bar
- Or: hamburger menu that shows both levels

**Note:** Final mobile pattern to be decided during responsive foundation (Epic 5). This PRD establishes the desktop pattern and data model. Mobile can adapt the same data structures.

### R4: Visual Design

- App icons use Lucide icons (already available via shadcn/ui) — not emoji
- Active app has a visual indicator (background highlight, left border accent, or similar)
- Active page has standard highlight (existing pattern from Sidebar)
- Smooth transitions between app switches
- Dark/light mode support via existing theme tokens
- All colours and spacing from `@pops/ui` design tokens — no arbitrary values

### R5: Single App Behaviour

With only Finance registered, the app switcher should not feel empty or pointless:
- App rail still shows the Finance icon (establishes the pattern)
- Page nav is immediately visible (no need to click to expand when there's only one app)
- As apps are added, the rail naturally populates

## Out of Scope

- Registering any new apps (Media, Inventory, etc.)
- Search / command palette (future feature)
- Favourites or pinning
- Notifications per app
- Mobile-optimised layout (Epic 5)

## Acceptance Criteria

1. App rail displays registered apps with Lucide icons
2. Clicking an app navigates to its basePath and shows its page nav
3. Active app and active page are visually highlighted
4. Navigation state persisted (collapsed/expanded) via uiStore
5. Works correctly with one registered app (Finance)
6. Adding a second app requires only: importing its navConfig and adding to the registry array
7. No emoji icons — all Lucide
8. All colours and spacing use design tokens
9. `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` all pass

## Edge Cases & Decisions

**Q: What happens when navigating to `/` ?**
A: Redirects to the first registered app's basePath (currently `/finance`).

**Q: What if a user navigates to an unknown app path like `/foo`?**
A: 404 page or redirect to `/`. Decide during implementation.

**Q: Should the page nav remember which page you were on per app?**
A: Yes. Navigating away from Finance and back should return to the last visited finance page, not the dashboard. React Router handles this naturally if the routes stay mounted.

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` all pass.

### US-1: Implement app registry and nav config types
**As a** developer, **I want** a typed app registry in the shell **so that** apps can register their navigation.

**Acceptance criteria:**
- `AppNavConfig` and `AppNavItem` types defined
- Shell has a registry array of app configs
- Finance's navConfig uses Lucide icon references instead of emoji
- Registry is the single source of truth for navigation

### US-2: Build app rail component
**As a** developer, **I want** a vertical app rail showing registered app icons **so that** users can switch between apps.

**Acceptance criteria:**
- Narrow vertical strip with app icons
- Active app visually highlighted
- Clicking an app navigates to its basePath
- Collapsible via toggle (state persisted in uiStore)
- Uses design tokens only

### US-3: Build page nav component
**As a** developer, **I want** a page nav panel showing the active app's pages **so that** users can navigate within an app.

**Acceptance criteria:**
- Shows page links for the active app
- Active page highlighted
- Expands alongside the app rail
- Smooth transition on app switch

### US-4: Integrate into RootLayout
**As a** developer, **I want** the app rail + page nav replacing the current Sidebar **so that** the shell uses the new navigation.

**Acceptance criteria:**
- Old Sidebar component replaced
- RootLayout uses new app rail + page nav
- All existing navigation still works
- E2E tests pass with new navigation structure
