# Epic 02: Shell & App Switcher

> Theme: [Foundation](../README.md)

## Scope

Build `pops-shell` — the application shell that hosts all app packages. Handles layout, routing, navigation, theming, and auth. Apps plug in as lazy-loaded workspace packages providing only their pages and nav config.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 005 | [Shell](../prds/005-shell/README.md) | Root layout, routing, lazy loading, providers, responsive layout | Done |
| 006 | [App Switcher](../prds/006-app-switcher/README.md) | AppRail (Discord-style icon strip), two-level navigation | Done |
| 007 | [App Theme Colour Propagation](../prds/007-app-theme-colour-propagation/README.md) | App declares colour once, shell propagates as CSS variable, components consume automatically | Done |

PRD-005 first, then PRD-006. PRD-007 can be done independently after PRD-005.

## Dependencies

- **Requires:** Epic 01 (shared components)
- **Unlocks:** All app packages (they need the shell to mount into)

## Out of Scope

- App page content (each app package owns its pages)
- API changes
- Responsive design audit (Epic 05)
