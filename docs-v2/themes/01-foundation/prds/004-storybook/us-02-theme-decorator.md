# US-02: Global theme decorator

> PRD: [004 — Storybook](README.md)
> Status: Done

## Description

As a developer, I want a global Storybook decorator that provides theme context (light/dark mode, app colour variable) so that I can preview components in all visual states.

## Acceptance Criteria

- [x] Global decorator in `preview.tsx` wraps all stories with theme provider
- [x] Storybook toolbar has a light/dark mode toggle
- [x] Switching modes updates all component styles in real-time
- [x] App colour variable is configurable in Storybook (dropdown to switch between emerald, indigo, amber, rose, sky, violet)
- [x] Default app colour is set (emerald) so stories render without manual selection
- [x] No console errors when switching themes

## Notes

The app colour dropdown lets developers preview how a component looks in different app contexts without switching apps. This is especially useful for components that use `bg-app-accent`.
