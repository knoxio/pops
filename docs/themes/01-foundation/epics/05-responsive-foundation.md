# Epic 05: Responsive Foundation

> Theme: [Foundation](../README.md)

## Scope

Ensure the shell and all shared components work well on every viewport — from 375px phone to 1536px+ desktop. Define breakpoints, touch target minimums, and component adaptation patterns that all apps follow.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 010 | [Responsive Foundation](../prds/010-responsive-foundation/README.md) | Tailwind v4 breakpoints, mobile-first layout, touch targets, DataTable/Dialog/Form adaptations | Partial |

## Dependencies

- **Requires:** Epic 01 (components must exist to make responsive), Epic 02 (shell layout must exist)
- **Unlocks:** All app packages (they inherit responsive patterns from shell + components)

## Out of Scope

- Native mobile app (Phase 5)
- PWA service worker caching strategy
- App-specific responsive redesigns (each app handles its own pages)
