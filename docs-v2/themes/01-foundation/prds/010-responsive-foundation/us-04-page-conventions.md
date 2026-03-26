# US-04: Page width and state conventions

> PRD: [010 — Responsive Foundation](README.md)
> Status: Done

## Description

As a developer building a new app, I want page width, padding, empty state, and error state conventions documented so that my app is consistent from day one.

## Acceptance Criteria

- [x] Page width convention documented: full-width vs constrained (`max-w-4xl mx-auto`)
- [x] Padding ownership documented: shell `<main>` has `p-0`, pages own their padding (`px-4 md:px-6 lg:px-8`)
- [x] Empty state pattern documented and implemented as a reusable component or documented pattern (icon + heading + description + action)
- [x] Error state pattern documented (same visual quality as empty state)
- [x] Page title icon consistency rule documented (all or none per app)
- [x] `mx-auto` rule enforced: no constrained page without centering
- [x] At least one existing page verified against each convention

## Notes

These conventions apply to every page in every app. Document them in the responsive foundation reference so new app PRDs can reference them directly.
