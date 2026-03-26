# US-02: Define app colour variable system

> PRD: [002 — Design Tokens & Theming](README.md)
> Status: Not started

## Description

As a developer, I want CSS variable definitions for app-specific accent colours so that components can use `bg-app-accent` and automatically get the right colour for whichever app they're in.

## Acceptance Criteria

- [ ] `--app-accent` and `--app-accent-foreground` CSS variables defined in globals.css
- [ ] Per-colour class definitions for each supported colour (emerald, indigo, amber, rose, sky, violet)
- [ ] Default falls back to `--primary` when no app colour is set
- [ ] Dark mode variants work for all app colours
- [ ] Tailwind utility classes `bg-app-accent`, `text-app-accent`, `border-app-accent` etc. are usable
- [ ] Opacity modifiers work (`bg-app-accent/10`, `text-app-accent/80`)

## Notes

This defines the CSS variable system only. The shell-side propagation (reading nav config and setting the variable on the app container) is PRD-007. Components consuming these variables is PRD-003 US-04.
