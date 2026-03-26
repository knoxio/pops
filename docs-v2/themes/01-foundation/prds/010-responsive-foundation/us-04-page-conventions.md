# US-04: Page width and state conventions

> PRD: [010 — Responsive Foundation](README.md)
> Status: Partial

## Description

As a developer building a new app, I want page width, padding, empty state, and error state conventions documented so that my app is consistent from day one.

## Acceptance Criteria

- [x] Page width convention documented: full-width vs constrained (`max-w-4xl mx-auto`) — documented in PRD, pages use max-w
- [ ] Padding ownership documented: shell `<main>` has `p-0`, pages own their padding — shell `<main>` currently has `p-4 md:p-6 lg:p-8`, not `p-0`
- [ ] Empty state pattern documented and implemented as a reusable component or documented pattern (icon + heading + description + action) — no reusable EmptyState component
- [x] Error state pattern documented (same visual quality as empty state) — ErrorBoundary + Alert destructive pattern in place
- [x] Page title icon consistency rule documented (all or none per app)
- [ ] `mx-auto` rule enforced: no constrained page without centering — not consistently applied
- [x] At least one existing page verified against each convention — DashboardPage verified

## Notes

These conventions apply to every page in every app. Document them in the responsive foundation reference so new app PRDs can reference them directly.
