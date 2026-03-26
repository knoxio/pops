# US-02: Global theme decorator

> PRD: [004 — Storybook](README.md)
> Status: Partial

**GH Issue:** #401

## Audit Findings

**Present:**
- `packages/ui/.storybook/preview.ts` imports `../src/theme/globals.css`, so all stories render with the correct design tokens
- Storybook controls (color matchers, date matchers) configured

**Missing:**
- No global decorator wrapping stories with a theme provider or dark mode class toggle
- No Storybook toolbar addon for light/dark mode switching — dark mode can't be previewed without manually setting the `dark` class on `<html>`
- No app colour variable dropdown (e.g., switching between emerald, indigo, amber themes)
- The `@storybook/addon-backgrounds` dark background option is not wired to the CSS `dark` class

## Description

As a developer, I want a global Storybook decorator that provides theme context (light/dark mode, app colour variable) so that I can preview components in all visual states.

## Acceptance Criteria

- [ ] Global decorator in `preview.ts` wraps all stories with theme provider
- [ ] Storybook toolbar has a light/dark mode toggle
- [ ] Switching modes updates all component styles in real-time
- [ ] App colour variable is configurable in Storybook (e.g., dropdown to switch between emerald, indigo, amber)
- [ ] Default app colour is set (e.g., primary) so stories render without manual selection
- [ ] No console errors when switching themes

## Notes

The app colour dropdown lets developers preview how a component looks in different app contexts without switching apps. This is especially useful for components that use `bg-app-accent`.
