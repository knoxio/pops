# ADR-004: Tailwind-Only Styling with Design Tokens

## Status

Accepted (2026-03-18)

## Context

POPS will have 10+ app packages sharing a UI library. Styling consistency across apps requires a single source of truth for design tokens (colours, spacing, typography, etc.).

## Decision

All styling MUST use Tailwind utility classes with values defined in the design token system. No exceptions.

### Rules

1. **No arbitrary values** — `w-[960px]`, `text-[#ff0000]`, `p-[13px]` are forbidden. Use only Tailwind's built-in scale or custom tokens defined in `@pops/ui`.
2. **No inline styles** — No `style={{ width: 960 }}`. Everything goes through Tailwind classes.
3. **No CSS modules or separate CSS files** — Except for the global Tailwind entry point and design token definitions in `@pops/ui`.
4. **All colours from the theme** — No hardcoded hex/rgb values in classes. Colours reference the theme's CSS variables via Tailwind (e.g., `bg-primary`, `text-muted-foreground`).
5. **Design tokens live in `@pops/ui`** — The single source of truth for the Tailwind theme: colours, spacing overrides, typography, breakpoints, shadows, etc.
6. **Apps consume, not define** — App packages use the tokens from `@pops/ui`. They do not extend or override the Tailwind config.

### What this means for `@pops/ui`

The design token system must be comprehensive enough that apps never need arbitrary values. This includes:

- Full colour palette (light + dark mode)
- Spacing scale covering all common sizes
- Typography scale (font sizes, weights, line heights)
- Container/layout widths as named tokens if the default scale isn't sufficient
- Breakpoints for responsive design

## Consequences

- Consistent visual language across all apps without manual enforcement
- Refactoring the design system (e.g., changing the primary colour) is a single-file change
- Slightly more upfront work defining tokens, but eliminates ad-hoc styling debt
- If a value isn't in the scale, you extend the design tokens in `@pops/ui` — not hack around it with arbitrary values
