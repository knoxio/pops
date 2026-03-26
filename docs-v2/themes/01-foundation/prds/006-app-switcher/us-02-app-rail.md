# US-02: Build app rail

> PRD: [006 — App Switcher](README.md)
> Status: To Review

## Description

As a developer, I want a vertical app rail showing registered app icons so that users can switch between apps with one click.

## Acceptance Criteria

- [ ] Narrow vertical strip (~64px) on the left side of the layout
- [ ] Each registered app shown as a Lucide icon
- [ ] Active app has a visual indicator (left-edge pill/accent, similar to Discord)
- [ ] Clicking an app icon navigates to that app's `basePath`
- [ ] Hover on inactive app shows tooltip with app label
- [ ] Rail is collapsible via toggle button
- [ ] Collapse state persisted in `uiStore` (survives page reload)
- [ ] Hidden on mobile (<768px)
- [ ] All styling uses design tokens — no arbitrary values

## Notes

The app rail is always visible on desktop. It's the primary navigation mechanism between apps. Keep it minimal — icon + active indicator + tooltip. No text labels on the rail itself.
