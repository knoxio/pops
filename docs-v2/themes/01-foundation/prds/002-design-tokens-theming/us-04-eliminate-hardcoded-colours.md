# US-04: Eliminate hardcoded app colours

> PRD: [002 — Design Tokens & Theming](README.md)
> Status: Not started

## Description

As a developer, I want all hardcoded app colour classes (e.g., `bg-indigo-600`, `text-emerald-400`, `bg-amber-500/10`) replaced with app-accent token references so that app colours are declared once and propagate automatically.

## Acceptance Criteria

- [ ] All hardcoded colour classes in `packages/app-media/` replaced with `app-accent` variants (e.g., `bg-indigo-600` → `bg-app-accent`, `text-indigo-400` → `text-app-accent`)
- [ ] All hardcoded colour classes in `packages/app-finance/` replaced similarly
- [ ] All hardcoded colour classes in `packages/app-inventory/` replaced similarly
- [ ] All hardcoded colour classes in `packages/app-ai/` replaced similarly
- [ ] Opacity variants work (`bg-app-accent/10` replaces `bg-indigo-500/10`)
- [ ] `grep` for hardcoded app colour classes (emerald-[456]00, indigo-[456]00, amber-[456]00, rose-[456]00) returns zero hits in app packages
- [ ] Each app visually looks the same as before (same colours, just sourced from the variable)

## Notes

This is a large find-and-replace across all app packages. The app colour variable system (US-02) and shell propagation (PRD-007) must be in place first. Do one app at a time and verify visually between each.

Colours in `@pops/ui` components that use `--primary` or other theme-level tokens are NOT changed — those are global theme colours, not app-specific accents. Only the app-specific accent colours (the ones that differ per app) are replaced.
