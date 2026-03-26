# US-01: Create globals.css with design tokens

> PRD: [002 — Design Tokens & Theming](README.md)
> Status: To Review

## Description

As a developer, I want a single `globals.css` file in `@pops/ui/theme` that defines all design tokens so that every package shares one source of truth for colours, spacing, typography, and breakpoints.

## Acceptance Criteria

- [ ] `packages/ui/src/theme/globals.css` exists
- [ ] Contains `@import "tailwindcss"`
- [ ] Contains `@theme` block with breakpoints, shadows, radii, and any custom spacing tokens
- [ ] Contains CSS variables for all colours in `:root` (light mode) and `.dark` (dark mode)
- [ ] Uses oklch colour space for all colour values
- [ ] Shell entry point imports `@pops/ui/theme`
- [ ] Light mode and dark mode both render correctly
- [ ] No theme-related CSS exists outside this file

## Notes

Tailwind v4 uses CSS-first configuration — no `tailwind.config.js`. The `@theme` block in CSS replaces the old JS config. Content detection is automatic for workspace packages.
