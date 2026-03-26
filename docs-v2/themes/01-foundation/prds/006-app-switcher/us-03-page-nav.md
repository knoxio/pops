# US-03: Build page nav panel

> PRD: [006 — App Switcher](README.md)
> Status: To Review

## Description

As a developer, I want a page nav panel showing the active app's pages so that users can navigate within an app.

## Acceptance Criteria

- [ ] Panel shows page links for the active app (read from its `navConfig.items`)
- [ ] Each link shows a Lucide icon + label
- [ ] Active page visually highlighted (background, font weight)
- [ ] Panel appears alongside the app rail (~200px wide)
- [ ] Smooth transition when switching between apps (page list updates)
- [ ] On tablet (768-1023px), collapses by default, opens as overlay on app icon click
- [ ] Panel has `overflow-y-auto` for apps with 10+ items
- [ ] All styling uses design tokens

## Notes

Page nav reads from the active app's `navConfig.items`. The shell determines the active app from the current URL path.
