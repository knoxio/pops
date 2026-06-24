# Epic: Shell & App Switcher

> Theme: [Foundation](../README.md)

## Scope

Build the shell — the application shell that hosts every pillar frontend. Handles layout, routing, navigation, theming, and auth. Pillar frontends plug in as lazy-loaded surfaces providing only their pages and nav config; the shell discovers them from the live registry snapshot.

## PRDs

| PRD                                                                                                        | Summary                                                                                      | Status |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| [Shell](../../../../pillars/shell/docs/prds/shell/README.md)                                               | Root layout, routing, lazy loading, providers, responsive layout                             | Done   |
| [App Switcher](../../../../pillars/shell/docs/prds/app-switcher/README.md)                                 | AppRail (Discord-style icon strip), two-level navigation                                     | Done   |
| [App Theme Colour Propagation](../../../../pillars/shell/docs/prds/app-theme-colour-propagation/README.md) | App declares colour once, shell propagates as CSS variable, components consume automatically | Done   |

Shell first, then App Switcher. App Theme Colour Propagation can be done independently after Shell.

## Dependencies

- **Requires:** [UI Component Library](ui-component-library.md) (shared components)
- **Unlocks:** All pillar frontends (they need the shell to mount into)

## Out of Scope

- App page content (each pillar frontend owns its pages)
- API changes
- Responsive design audit ([Responsive Foundation](responsive-foundation.md))
