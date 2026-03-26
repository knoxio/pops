# US-02: Global theme decorator

> PRD: [004 — Storybook](README.md)
> Status: To Review

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
