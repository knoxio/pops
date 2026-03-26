# PRD-002: Design Tokens & Theming

> Epic: [01 — UI Component Library](../../epics/01-ui-component-library.md)
> Status: Partial

## Overview

Establish the design token system that all POPS components and apps consume. Colours, spacing, typography, breakpoints, and the app colour variable system — all defined in one place (`@pops/ui/theme`), all consumed via Tailwind utility classes. No arbitrary values, no hardcoded colours, no per-app overrides.

## Data Model

No database work — this is CSS/Tailwind configuration.

## Design Token Architecture

### Token Categories

| Category | Examples | Defined in |
|----------|---------|------------|
| Colours | `--background`, `--foreground`, `--primary`, `--muted`, `--destructive` | `globals.css` CSS variables |
| App colour | `--app-accent`, `--app-accent-foreground` | Set by shell per active app, consumed by components |
| Spacing | Tailwind default scale (0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, ...) | Tailwind v4 defaults |
| Typography | Font family, size scale, weight scale, line heights | `@theme` block in `globals.css` |
| Breakpoints | sm (640px), md (768px), lg (1024px), xl (1280px), 2xl (1536px) | `@theme` block |
| Shadows | Elevation levels for cards, dropdowns, modals | `@theme` block |
| Radii | Border radius scale | `@theme` block |

### Colour System

Colours use oklch colour space for perceptual uniformity. Light and dark mode tokens defined as CSS variables:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0.064 270.94);
  /* ... */
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ... */
}
```

Components reference these via Tailwind: `bg-background`, `text-foreground`, `bg-primary`.

### App Colour Variable System

Each app declares a theme colour in its nav config. The shell sets `--app-accent` and `--app-accent-foreground` CSS variables on the app container. Components use `bg-app-accent`, `text-app-accent` instead of hardcoded colour classes like `bg-indigo-600` or `text-emerald-400`.

This means:
- Finance declares `color: "emerald"` → all components within finance get emerald accents
- Media declares `color: "indigo"` → all components within media get indigo accents
- A component doesn't know which app it's in — it uses `bg-app-accent` and the right colour appears

### File Structure

```
packages/ui/src/theme/
  globals.css           ← @import "tailwindcss", @theme block, CSS variables, light/dark tokens, app colour tokens
```

Theme CSS is imported once in the shell's entry point:
```typescript
import '@pops/ui/theme'
```

Apps do NOT define their own theme tokens — they consume from `@pops/ui`.

## Business Rules

- All colours must reference CSS variables via Tailwind classes — no hardcoded hex/rgb/oklch values in component code
- No arbitrary Tailwind values (`w-[960px]`, `text-[#ff0000]`) except Radix UI CSS variable bindings (`w-[var(--radix-*)]`)
- Apps consume tokens, never define or override them
- Light and dark mode must both work — every colour token needs both variants
- The app colour variable must cascade to all nested components without manual propagation

### Arbitrary Value Audit

These patterns must be eliminated and replaced with token-based classes:

| Pattern | Example | Replacement |
|---------|---------|-------------|
| Fixed pixel widths | `w-[180px]`, `w-[70px]` | Tailwind scale: `w-45`, `w-18` |
| Fixed pixel min-widths | `min-w-[120px]`, `min-w-[200px]` | Tailwind scale: `min-w-30`, `min-w-50` |
| Fixed pixel heights | `min-h-[2rem]` | Tailwind scale: `min-h-8` |
| Fixed max-heights | `max-h-[300px]` | Tailwind scale: `max-h-75` |
| Centering hacks | `top-[50%]`, `translate-x-[-50%]` | Built-in: `inset-0 flex items-center justify-center` |
| Arbitrary padding | `p-[3px]` | Closest token or custom token in `@theme` |
| Hardcoded app colours | `bg-indigo-600`, `text-emerald-400` | `bg-app-accent`, `text-app-accent` |

**Exception rule:** `w-[var(--radix-*)]` and similar Radix UI CSS variable bindings are permitted — they reference runtime-computed values, not design tokens.

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Radix CSS variable bindings | Permitted — documented exception. Not design tokens |
| Value not in Tailwind scale | Add a custom token to `@theme` block in globals.css, don't use arbitrary value |
| New app without declared colour | Falls back to `--primary` colour |
| Dark mode for app colours | Each app colour must have appropriate dark mode variants |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-globals-css](us-01-globals-css.md) | Create globals.css with Tailwind imports, @theme block, CSS variables, light/dark tokens ✅ | No (first) |
| 02 | [us-02-app-colour-variable](us-02-app-colour-variable.md) | Define the app colour CSS variable system (--app-accent, --app-accent-foreground) with per-colour definitions | Blocked by us-01 |
| 03 | [us-03-eliminate-arbitrary-values](us-03-eliminate-arbitrary-values.md) | Replace all arbitrary Tailwind values with token-based classes across all components (partial) | Blocked by us-01 |
| 04 | [us-04-eliminate-hardcoded-colours](us-04-eliminate-hardcoded-colours.md) | Replace all hardcoded app colour classes (bg-indigo-600, text-emerald-400, etc.) with app-accent token references | Blocked by us-02 |

## Verification

Every US is only done when:
- `pnpm typecheck` passes
- `pnpm lint` passes
- `pnpm build` succeeds
- Light and dark mode both work with no visual regressions
- Storybook renders all component stories correctly

## Out of Scope

- Component implementation (PRD-003)
- Storybook configuration (PRD-004)
- Shell-side colour propagation mechanism (PRD-007)
