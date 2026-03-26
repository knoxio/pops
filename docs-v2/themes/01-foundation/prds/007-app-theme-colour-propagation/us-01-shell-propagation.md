# US-01: Shell reads active app colour and sets CSS variables

> PRD: [007 — App Theme Colour Propagation](README.md)
> Status: Done

## Description

As a developer, I want the shell to automatically set `--app-accent` CSS variables based on the active app so that all components within that app get the right colour without knowing which app they're in.

## Acceptance Criteria

- [x] Shell detects the active app from the current URL path (matches against registered app `basePath` values)
- [x] Shell reads the active app's `color` from its `navConfig`
- [x] Shell sets `--app-accent` and `--app-accent-foreground` CSS variables on the app's container element
- [x] Variables update instantly when navigating between apps
- [x] Both light and dark mode values are set correctly
- [x] Apps with no `color` declared fall back to `--primary`
- [x] Opacity modifiers work (`bg-app-accent/10`, `text-app-accent/80`)
- [x] No flash or delay during app switch

## Notes

The CSS variable approach means propagation is handled by the browser's CSS cascade — no React context, no prop drilling, no re-renders. Components just reference `var(--app-accent)` via Tailwind and the right colour appears.
