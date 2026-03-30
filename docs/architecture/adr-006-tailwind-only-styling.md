# ADR-006: Tailwind-Only Styling with Design Tokens

## Status

Accepted

## Context

POPS has 10+ app packages sharing a UI library. Styling consistency across apps requires a single source of truth for design tokens (colours, spacing, typography) and a strict approach that prevents drift.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Tailwind utility classes only | Consistent, refactorable from one place, no CSS file sprawl | Requires comprehensive token system upfront |
| CSS Modules per component | Scoped styles, familiar | Scattered across packages, hard to maintain consistency |
| Styled-components / CSS-in-JS | Dynamic styling, colocation | Runtime overhead, bundle size, different paradigm from Tailwind |

## Decision

All styling uses Tailwind utility classes with values from the design token system. No exceptions.

Rules:
- **No arbitrary values** — `w-[960px]`, `text-[#ff0000]` are forbidden. Use Tailwind's scale or custom tokens in `@pops/ui`
- **No inline styles** — Everything goes through Tailwind classes
- **No CSS modules or separate CSS files** — Except the global Tailwind entry point and token definitions in `@pops/ui`
- **All colours from the theme** — No hardcoded hex/rgb. Colours reference CSS variables via Tailwind (`bg-primary`, `text-muted-foreground`)
- **Apps consume, not define** — App packages use tokens from `@pops/ui`. They do not extend or override the Tailwind config
- If a value isn't in the scale, extend the design tokens in `@pops/ui` — don't hack around it with arbitrary values

## Consequences

- Consistent visual language across all apps without manual enforcement
- Refactoring the design system (e.g., changing primary colour) is a single-file change
- More upfront work defining tokens, but eliminates ad-hoc styling debt
- The token system must be comprehensive: full colour palette (light + dark), spacing, typography, breakpoints, container widths
