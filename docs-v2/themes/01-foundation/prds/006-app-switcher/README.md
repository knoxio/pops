# PRD-006: App Switcher

> Epic: [02 — Shell & App Switcher](../../epics/02-shell-app-switcher.md)
> Status: To Review

## Overview

Build a two-level navigation system for switching between apps and navigating within them. App selection (top-level rail) and page navigation (within the active app). Should feel natural with one app and scale gracefully to ten.

## Navigation Structure

Two distinct levels:

1. **App rail** — Always visible. Vertical strip of icons for all registered apps. Highlights the active app. Clicking switches context.
2. **Page nav** — Shows pages within the active app. Expands alongside the app rail.

### Design Reference

Discord's server selection rail. Vertical strip of icons, single tap to switch context, active indicator, page list alongside. Scales from 1 to 50 without redesign.

## App Registration

Each app package exports a `navConfig` conforming to `AppNavConfig`:

```typescript
interface AppNavConfig {
  id: string;           // 'finance', 'media', 'inventory'
  label: string;        // 'Finance'
  icon: string;         // Lucide icon component name
  color?: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky' | 'violet';
  basePath: string;     // '/finance'
  items: AppNavItem[];
}

interface AppNavItem {
  path: string;         // Relative to basePath. '' for index.
  label: string;
  icon: string;         // Lucide icon component name
}
```

The shell maintains a registry of all app configs — single source of truth for navigation rendering. Adding an app to the switcher = importing its navConfig and adding to the registry.

## Responsive Behaviour

**Desktop (≥1024px):**
- App rail: narrow vertical strip (~64px), icon-only
- Active app: visual pill/indicator (left-edge accent, similar to Discord)
- Single click switches context — page nav (~200px) immediately shows that app's pages
- Hover on inactive app shows tooltip with app name
- Rail collapsible via toggle (persisted in uiStore)

**Tablet (768–1023px):**
- Same as desktop but page nav collapses by default, opens as overlay on app icon click

**Mobile (<768px):**
- App rail hidden
- Navigation via hamburger menu or bottom tab bar
- Page nav as horizontal scroll or dropdown

## Single App Behaviour

With only one app registered, the switcher should not feel empty:
- App rail still shows the icon (establishes the pattern)
- Page nav is immediately visible (no click needed to expand)
- As apps are added, the rail naturally populates

## Business Rules

- All icons are Lucide — no emoji
- All colours and spacing from `@pops/ui` design tokens
- Active app and active page are visually distinct
- Navigation state (collapsed/expanded) persisted via uiStore
- Navigating away from an app and back returns to the last visited page (React Router handles this naturally)
- `/` redirects to the first registered app's basePath

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Only one app registered | Rail shows one icon, page nav always visible |
| Unknown app path (`/foo`) | NotFoundPage within shell layout (from PRD-005) |
| App with 10+ page items | Page nav scrolls independently (`overflow-y-auto`) |
| Navigate away and back to an app | Returns to last visited page within that app |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-nav-types-registry](us-01-nav-types-registry.md) | Define AppNavConfig/AppNavItem types and app registry in the shell | Done | No (first) |
| 02 | [us-02-app-rail](us-02-app-rail.md) | Build vertical app rail with icons, active indicator, collapse toggle | Done | Blocked by us-01 |
| 03 | [us-03-page-nav](us-03-page-nav.md) | Build page nav panel showing active app's pages | Partial | Blocked by us-01 |
| 04 | [us-04-layout-integration](us-04-layout-integration.md) | Integrate app rail + page nav into RootLayout, replace basic sidebar | Partial | Blocked by us-02, us-03 |

## Verification

- All registered apps appear in the app rail with correct icons
- Clicking an app navigates to its basePath and shows its pages
- Active app and page are visually highlighted
- Works correctly with one registered app
- Adding a second app requires only: import navConfig + add to registry
- Collapse toggle works and persists across page reloads
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pass

## Out of Scope

- App theme colour propagation (PRD-007)
- Search / command palette (PRD-056/057)
- Favourites, pinning, or notifications
