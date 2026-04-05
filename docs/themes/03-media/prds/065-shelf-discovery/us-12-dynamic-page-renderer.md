# US-12: Dynamic shelf page renderer

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a user, I want the discover page to render N shelves dynamically from the assembly response, with lazy loading for off-screen shelves.

## Acceptance Criteria

- [x] DiscoverPage calls `assembleSession` on mount (replaces hardcoded section queries)
- [x] Renders each shelf as a horizontal scroll row with title, subtitle, emoji
- [x] Shelves rendered in the order returned by assembly
- [x] Off-screen shelves lazy-loaded (IntersectionObserver or similar) — only fetch items when scrolled into view
- [x] Each shelf has a "Show more" button when hasMore is true
- [x] Show more calls `getShelfPage` and appends items
- [x] DiscoverCard component reused for all shelf items (existing component)
- [x] Loading skeleton while assembly runs
- [x] Tests: renders correct number of shelves, lazy loading triggers, show more works
