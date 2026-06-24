# Epic: Responsive Foundation

> Theme: [Foundation](../README.md)

## Scope

Ensure the shell and all shared components work well on every viewport — from 375px phone to 1536px+ desktop. Define breakpoints, touch target minimums, and component adaptation patterns that every pillar frontend follows.

## PRDs

| PRD                                                              | Summary                                                                                        | Status  |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------- |
| [Responsive Foundation](../prds/responsive-foundation/README.md) | Tailwind v4 breakpoints, mobile-first layout, touch targets, DataTable/Dialog/Form adaptations | Partial |

## Dependencies

- **Requires:** [UI Component Library](ui-component-library.md) (components must exist to make responsive), [Shell & App Switcher](shell-app-switcher.md) (shell layout must exist)
- **Unlocks:** All pillar frontends (they inherit responsive patterns from shell + components)

## Out of Scope

- Native mobile app (Phase 5)
- PWA service worker caching strategy
- App-specific responsive redesigns (each app handles its own pages)
