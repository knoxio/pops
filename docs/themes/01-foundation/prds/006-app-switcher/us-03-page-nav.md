# US-03: Build page nav panel

> PRD: [006 — App Switcher](README.md)
> Status: Done
> Last checked: 2026-04-18

## Description

As a developer, I want a page nav panel showing the active app's pages so that users can navigate within an app.

## Acceptance Criteria

- [x] Panel shows page links for the active app (read from its `navConfig.items`)
- [x] Each link shows a Lucide icon + label
- [x] Active page visually highlighted (background, font weight)
- [x] Panel appears alongside the app rail (~200px wide)
- [x] Smooth transition when switching between apps (page list updates)
- [x] On tablet (768-1023px), collapses by default, opens as overlay on app icon click
- [x] Panel has `overflow-y-auto` for apps with 10+ items
- [x] All styling uses design tokens

## Notes

Page nav reads from the active app's `navConfig.items`. The shell determines the active app from the current URL path.
