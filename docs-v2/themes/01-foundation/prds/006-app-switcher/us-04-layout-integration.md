# US-04: Integrate into RootLayout

> PRD: [006 — App Switcher](README.md)
> Status: To Review

## Description

As a developer, I want the app rail + page nav integrated into the shell's RootLayout so that the new navigation replaces any placeholder sidebar.

## Acceptance Criteria

- [ ] RootLayout uses app rail + page nav instead of a basic sidebar
- [ ] Layout: TopBar (fixed top) → App Rail (fixed left) → Page Nav (alongside rail) → Content (scrolls)
- [ ] All existing navigation still works (all registered app pages accessible)
- [ ] App rail and page nav are fixed — do not scroll with content
- [ ] Content area adjusts width based on rail/nav collapsed state
- [ ] E2E tests pass with the new navigation structure
- [ ] Single app (finance only) looks natural — not empty or broken

## Notes

This replaces PRD-005's placeholder sidebar with the full two-level navigation. The content area width should transition smoothly when the rail/nav collapse state changes.
