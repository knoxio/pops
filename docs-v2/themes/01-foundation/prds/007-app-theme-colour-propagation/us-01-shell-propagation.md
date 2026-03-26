# US-01: Shell reads active app colour and sets CSS variables

> PRD: [007 — App Theme Colour Propagation](README.md)
> Status: Not started

## Description

As a developer, I want the shell to automatically set `--app-accent` CSS variables based on the active app so that all components within that app get the right colour without knowing which app they're in.

## Acceptance Criteria

- [ ] Shell detects the active app from the current URL path (matches against registered app `basePath` values)
- [ ] Shell reads the active app's `color` from its `navConfig`
- [ ] Shell sets `--app-accent` and `--app-accent-foreground` CSS variables on the app's container element
- [ ] Variables update instantly when navigating between apps
- [ ] Both light and dark mode values are set correctly
- [ ] Apps with no `color` declared fall back to `--primary`
- [ ] Opacity modifiers work (`bg-app-accent/10`, `text-app-accent/80`)
- [ ] No flash or delay during app switch

## Notes

The CSS variable approach means propagation is handled by the browser's CSS cascade — no React context, no prop drilling, no re-renders. Components just reference `var(--app-accent)` via Tailwind and the right colour appears.
