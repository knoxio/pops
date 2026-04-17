# US-01: TopBar search bar

> PRD: [056 — Search UI](README.md)
> Status: Done

## Description

As a user, I want a search bar in the TopBar so that I can search the entire platform from anywhere.

## Acceptance Criteria

- [x] Search input in the TopBar, always visible on desktop
- [x] Keyboard shortcut to focus (Cmd+K or Ctrl+K)
- [x] Placeholder text: "Search POPS..."
- [x] Debounced input (300ms) before triggering search
- [x] Clear button when text is present
- [x] Mobile: collapses to search icon, expands on tap
- [x] Focus trap when results panel is open

## Notes

Search icon from Lucide. The bar is part of the shell — not owned by any app.
