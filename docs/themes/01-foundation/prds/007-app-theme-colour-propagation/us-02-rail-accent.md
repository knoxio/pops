# US-02: App rail uses active app's accent colour

> PRD: [007 — App Theme Colour Propagation](README.md)
> Status: Done

## Description

As a developer, I want the app rail's active indicator to use the active app's accent colour so that the navigation reinforces which app the user is in.

## Acceptance Criteria

- [x] Active app indicator in the app rail uses `--app-accent` colour
- [x] Indicator colour updates when switching apps
- [x] Works in both light and dark mode
- [x] Inactive app icons use `text-muted-foreground` — only the active one uses the accent

## Notes

The app rail sits outside the app container, so it may need to read the colour directly from the registry rather than relying on CSS cascade from the container.
