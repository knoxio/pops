# US-02: Build app rail

> PRD: [006 — App Switcher](README.md)
> Status: Partial

## Description

As a developer, I want a vertical app rail showing registered app icons so that users can switch between apps with one click.

## Acceptance Criteria

- [x] Narrow vertical strip (~64px) on the left side of the layout
- [x] Each registered app shown as a Lucide icon
- [x] Active app has a visual indicator (left-edge pill/accent, similar to Discord)
- [x] Clicking an app icon navigates to that app's `basePath`
- [x] Hover on inactive app shows tooltip with app label
- [x] Rail is collapsible via toggle button
- [x] Collapse state persisted in `uiStore` (survives page reload)
- [x] Hidden on mobile (<768px)
- [ ] All styling uses design tokens — no arbitrary values

## Notes

The app rail is always visible on desktop. It's the primary navigation mechanism between apps. Keep it minimal — icon + active indicator + tooltip. No text labels on the rail itself.
