# US-01: Create globals.css with design tokens

> PRD: [002 — Design Tokens & Theming](README.md)
> Status: Partial

## Description

As a developer, I want a single `globals.css` file in `@pops/ui/theme` that defines all design tokens so that every package shares one source of truth for colours, spacing, typography, and breakpoints.

## Acceptance Criteria

- [x] `packages/ui/src/theme/globals.css` exists
- [x] Contains `@import "tailwindcss"`
- [x] Contains `@theme` block with breakpoints, shadows, radii, and any custom spacing tokens
- [x] Contains CSS variables for all colours in `:root` (light mode) and `.dark` (dark mode)
- [x] Uses oklch colour space for all colour values
- [x] Shell entry point imports `@pops/ui/theme`
- [x] Light mode and dark mode both render correctly
- [x] No theme-related CSS exists outside this file
- [ ] All custom Tailwind utility classes used across the codebase (e.g., `text-2xs`) are defined in the `@theme` block — no undefined utility classes

## Notes

Tailwind v4 uses CSS-first configuration — no `tailwind.config.js`. The `@theme` block in CSS replaces the old JS config. Content detection is automatic for workspace packages.
