# US-04: Integrate into RootLayout

> PRD: [006 — App Switcher](README.md)
> Status: Done

## Description

As a developer, I want the app rail + page nav integrated into the shell's RootLayout so that the new navigation replaces any placeholder sidebar.

## Acceptance Criteria

- [x] RootLayout uses app rail + page nav instead of a basic sidebar
- [x] Layout: TopBar (fixed top) → App Rail (fixed left) → Page Nav (alongside rail) → Content (scrolls)
- [x] All existing navigation still works (all registered app pages accessible)
- [x] App rail and page nav are fixed — do not scroll with content
- [x] Content area adjusts width based on rail/nav collapsed state
- [x] E2E tests pass with the new navigation structure
- [x] Single app (finance only) looks natural — not empty or broken

## Notes

This replaces PRD-005's placeholder sidebar with the full two-level navigation. The content area width should transition smoothly when the rail/nav collapse state changes.
