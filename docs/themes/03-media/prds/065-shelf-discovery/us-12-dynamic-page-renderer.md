# US-12: Dynamic shelf page renderer

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a user, I want the discover page to render N shelves dynamically from the assembly response, with lazy loading for off-screen shelves.

## Acceptance Criteria

- [ ] DiscoverPage calls `assembleSession` on mount (replaces hardcoded section queries)
- [ ] Renders each shelf as a horizontal scroll row with title, subtitle, emoji
- [ ] Shelves rendered in the order returned by assembly
- [ ] Off-screen shelves lazy-loaded (IntersectionObserver or similar) — only fetch items when scrolled into view
- [ ] Each shelf has a "Show more" button when hasMore is true
- [ ] Show more calls `getShelfPage` and appends items
- [ ] DiscoverCard component reused for all shelf items (existing component)
- [ ] Loading skeleton while assembly runs
- [ ] Tests: renders correct number of shelves, lazy loading triggers, show more works
