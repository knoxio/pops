# PRD: Design Tokens & Theming

> Theme: [Foundation](../../README.md)
> Status: Partial (token system shipped; app-package colour cleanup outstanding)

## Purpose

One design-token system that every POPS component, the shell, and every pillar frontend consume. Colours, status colours, the per-app accent, spacing, typography, breakpoints, radii, shadows, and animations are defined once in `@pops/ui/theme` (`libs/ui/src/theme/`) and consumed exclusively through Tailwind utility classes. No arbitrary Tailwind values, no hardcoded hex/oklch in component code, no per-app or per-pillar token overrides.

The shell sets a single accent colour per active app; every nested component reads `bg-app-accent` / `text-app-accent` and picks up the right hue with no manual propagation.

## Where It Lives

| Concern                    | Location                                                                  |
| -------------------------- | ------------------------------------------------------------------------- |
| Token source of truth      | `libs/ui/src/theme/globals.css`                                           |
| CSS side-effect type decl  | `libs/ui/src/theme/globals.d.ts` (`declare module '@pops/ui/theme'`)      |
| Canvas/JS colour constants | `libs/ui/src/theme/graph-colors.ts` (`GRAPH_COLORS`)                      |
| Package entry              | `@pops/ui` exports `./theme`, `./theme/graph-colors`, `./primitives/*`    |
| Single CSS import          | `pillars/shell/src/main.tsx` → `import '@pops/ui/theme'`                  |
| Per-app accent propagation | `pillars/shell/src/app/layout/RootLayout.tsx`, `app-rail/AppRailIcon.tsx` |

Pillar frontends (`pillars/<id>/app`, published as `@pops/app-<id>`) consume tokens; they never define or import their own theme CSS. There is no `tailwind.config.*` — Tailwind v4 is configured CSS-first via the `@theme` block.

## Token Model

Tailwind v4 CSS-first config. `@theme` maps Tailwind colour utilities onto CSS custom properties; the actual values live in `:root` (light) and `.dark` (dark). `@theme inline` keeps `--app-accent` resolved at runtime so opacity modifiers (`bg-app-accent/10`) work while `.app-*` classes override it.

| Category         | Tokens                                                                                                                                                     | Defined in                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Core colours     | `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring` | `:root` / `.dark`            |
| Status colours   | `--success`, `--warning`, `--info` (+ `-foreground` variants); `--destructive` covers error                                                                | `:root` / `.dark`            |
| Charts           | `--chart-1`…`--chart-5`                                                                                                                                    | `:root`                      |
| Stat palette     | `--stat-sky`, `--stat-violet`, `--stat-rose`, `--stat-orange`                                                                                              | `:root` / `.dark`            |
| Sidebar          | `--sidebar*` family                                                                                                                                        | `:root` / `.dark`            |
| App accent       | `--app-accent`, `--app-accent-foreground` (default to `--primary`)                                                                                         | `:root` / `.dark` + `.app-*` |
| Typography       | `--font-size-2xs` (+ line-height); `Plus Jakarta Sans Variable` body font                                                                                  | `@theme`, `@layer base`      |
| Breakpoints      | sm 640, md 768, lg 1024, xl 1280, 2xl 1536                                                                                                                 | `@theme`                     |
| Radii            | `--radius` 0.625rem base + `--radius-xs/sm/md/lg/xl/2xl`                                                                                                   | `@theme`, `:root`            |
| Animations       | `--animate-accordion-down/up`, `--animate-shrink-bar` (+ keyframes)                                                                                        | `@theme`                     |
| Layout tokens    | `--tree-indent-step/base`, `--tree-picker-step`, `--tooltip-arrow-offset`, `--size-dialog-*`                                                               | `:root`                      |
| Custom utilities | `text-2xs`, `tracking-label`, `tabular-nums`                                                                                                               | `@utility` blocks            |
| JS colour tokens | `GRAPH_COLORS` (Canvas 2D node/edge/type palette)                                                                                                          | `graph-colors.ts`            |

All colour values use the oklch colour space for perceptual uniformity. Every colour token has a light value in `:root` and a dark value in `.dark`.

### App Accent System

Each app declares a `color` in its nav/manifest config. The shell maps it to a class:

```
const appColorClass = activeApp?.color ? `app-${activeApp.color}` : undefined;
```

That class is applied on the shell root container (`RootLayout`) and on the app-rail icon. Each `.app-<color>` rule in `globals.css` sets `--app-accent`, `--app-accent-foreground`, and overrides `--primary`/`--primary-foreground` for that subtree, with separate `.dark .app-<color>` values. Supported colours: **emerald, indigo, amber, rose, sky, violet**. With no declared colour, `--app-accent` falls back to `--primary`.

Components never know which app they render in — they use `bg-app-accent`, `text-app-accent`, `border-app-accent` and the correct hue cascades down. Opacity modifiers (`bg-app-accent/10`, `text-app-accent/70`) are supported because of `@theme inline`.

## Rules

- Colours referenced only via Tailwind classes bound to CSS variables — no hardcoded hex/rgb/oklch in component code.
- No arbitrary Tailwind values (`w-[180px]`, `text-[#ff0000]`). Use the Tailwind scale or add a named token to `@theme`/`:root`.
- Status colours use semantic tokens (`text-destructive`/`text-error`, `bg-success`, `text-warning`, `bg-info`), never raw `red-*`/`green-*`/`yellow-*`/`blue-*`.
- Multi-state semantic badges (condition/warranty/priority/type) use design-token utilities (`bg-success/10`, `bg-stat-rose/10`, …) — they are not app accents.
- No inline `style={{}}` with hardcoded colour values. Tailwind classes only.
- App-specific accents use `app-accent`; global theme colours (`--primary` etc.) are not app-specific and stay as-is.
- Pillar frontends consume tokens, never define or override them. Theme CSS is imported exactly once, in the shell.
- Light and dark must both work for every token.
- The app accent cascades automatically; no per-component propagation code.

### Permitted Exceptions

| Pattern                                                                                                 | Why permitted                                                                                                                          |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `w-[var(--radix-*)]` and similar Radix bindings                                                         | Runtime-computed values, not design tokens                                                                                             |
| `calc()` / viewport-unit arbitraries (`max-h-[calc(100vh-6rem)]`, `max-h-[85vh]`, `h-[calc(100%-1px)]`) | Responsive layout math that resists tokenisation                                                                                       |
| Dynamic widths/transforms (`style={{ width: \`${pct}%\` }}`, progress `translateX`)                     | CSS cannot compute runtime percentages from JS without inline style                                                                    |
| `GRAPH_COLORS` hardcoded hex                                                                            | Canvas 2D cannot resolve CSS custom properties at paint time; structural colours still read `getComputedStyle` at render for dark mode |

### Arbitrary-Value Replacement Map (reference)

| Pattern                | Example                             | Replacement                                  |
| ---------------------- | ----------------------------------- | -------------------------------------------- |
| Fixed pixel widths     | `w-[180px]`, `w-[70px]`             | `w-45`, `w-18`                               |
| Fixed pixel min-widths | `min-w-[120px]`, `min-w-[200px]`    | `min-w-30`, `min-w-50`                       |
| Fixed pixel heights    | `min-h-[2rem]`                      | `min-h-8`                                    |
| Fixed max-heights      | `max-h-[300px]`                     | `max-h-75`                                   |
| Touch targets          | `min-w-[44px]`/`min-h-[44px]`       | `min-w-11` / `min-h-11`                      |
| Centering hacks        | `top-[50%]`, `translate-x-[-50%]`   | `inset-0 flex items-center justify-center`   |
| Arbitrary padding      | `p-[3px]`                           | Closest token or new `@theme`/`:root` token  |
| Tab offset / radius    | `-5px` offset, `2px` radius         | `--tooltip-arrow-offset` token, `rounded-xs` |
| Hardcoded app colours  | `bg-indigo-600`, `text-emerald-400` | `bg-app-accent`, `text-app-accent`           |

## Edge Cases

| Case                             | Behaviour                                                               |
| -------------------------------- | ----------------------------------------------------------------------- |
| App with no declared colour      | `--app-accent` falls back to `--primary` (both modes)                   |
| Value absent from Tailwind scale | Add a named token to `@theme`/`:root`; never approximate with arbitrary |
| Dark mode for app accents        | Each `.app-<color>` has a paired `.dark .app-<color>` rule              |
| Canvas / chart colours           | `GRAPH_COLORS` for fills; structural colours read CSS vars at render    |
| Radix runtime bindings           | Left in place as documented exception                                   |

## Acceptance Criteria

### Token foundation

- [x] `libs/ui/src/theme/globals.css` exists with `@import 'tailwindcss'`, an `@theme` block (breakpoints, radii, font tokens, animations), and `@theme inline` for the app accent
- [x] Colour CSS variables defined in `:root` (light) and `.dark` (dark), all in oklch
- [x] `@pops/ui` exports `./theme` and the shell imports `@pops/ui/theme` exactly once (`pillars/shell/src/main.tsx`)
- [x] No design-token theme CSS (`@theme`, the colour `:root`/`.dark` blocks, `.app-*` rules) exists outside this file; no `tailwind.config.*`. (`pillars/docs/src/styles.css` is a self-contained viewer stylesheet for the API-docs pillar with its own `--pops-docs-*` variables; it is not part of the shared token system.)
- [x] Custom utilities used across the codebase (`text-2xs`, `tracking-label`, `tabular-nums`) are defined in the theme

### App accent system

- [x] `--app-accent` and `--app-accent-foreground` defined; default to `--primary`
- [x] `.app-<color>` rules for emerald, indigo, amber, rose, sky, violet, each with a paired `.dark` rule
- [x] `bg-app-accent`, `text-app-accent`, `border-app-accent` and opacity modifiers (`bg-app-accent/10`) usable
- [x] Shell reads `activeApp.color` and applies `app-<color>` on the root container and app-rail icon (`RootLayout.tsx`, `AppRailIcon.tsx`) — propagation is automatic, no per-component wiring

### Status & stat tokens

- [x] `--success`/`--warning`/`--info` (+ `-foreground`) and `--stat-sky/violet/rose/orange` defined for both modes
- [x] `text-success`, `bg-success`, `border-warning`, `bg-info`, `bg-stat-rose/10`, etc. usable with opacity modifiers
- [x] `libs/ui/src` is free of hardcoded `red-/green-/yellow-/blue-*` status classes (excl. stories/tests); semantic badges migrated to token utilities

### Arbitrary values

- [x] `libs/ui/src` (excl. stories/tests) is free of arbitrary fixed-px/rem/% Tailwind values; only Radix bindings and `calc()`/viewport expressions remain
- [x] Radix bindings and viewport `calc()` expressions documented as permitted and left in place

### Inline styles & JS colour constants

- [x] UI primitive focus borders no longer use inline `style={{ boxShadow: 'rgb(55, 65, 81)' }}` — zero `rgb(55,...)` in `libs/ui/src`
- [x] Tree indentation driven by `--tree-indent-step/base` and `--tree-picker-step` tokens (consumed in `pillars/inventory/app`)
- [x] `GRAPH_COLORS` extracted to `@pops/ui/theme/graph-colors` and consumed by Canvas rendering (`pillars/inventory/app/.../connection-graph/draw.ts`)
- [x] Dynamic progress/width inline styles documented as the permitted exception
- [ ] `libs/ui/src/components/TreeView.tsx` still hardcodes `style={{ paddingLeft: \`${level _ 14}px\` }}`instead of the`--tree-indent-_`tokens — last inline-style violation in`libs/ui`

### App-package colour cleanup (outstanding)

- [ ] Hardcoded app-accent classes in pillar frontends replaced with `app-accent` variants — ~56 instances remain across `pillars/{ai,cerebrum,finance,food,lists,media}/app` (e.g. `bg-amber-500`, `bg-rose-500/10`, `text-violet-700`)
- [ ] One stray hardcoded status class remains: `bg-green-100/30` in `pillars/food/app/src/pages/plan/PlanCell.tsx`
- [ ] `grep` for hardcoded app-accent / status colour classes returns zero hits across all `pillars/*/app/src` (excl. stories/tests)

## Verification

A unit is done only when, for the touched packages:

- typecheck passes (`mise run typecheck` / `tsc -b`)
- lint passes
- build succeeds
- light and dark both render with no visual regression
- Storybook renders all stories (`libs/ui`)

## Out of Scope

- Component implementation (separate UI-component-library PRD)
- Storybook configuration
- The nav/manifest `color` field schema (owned by the shell/navigation layer; this PRD only consumes it)

## Drift Notes

- The `@source` globs in `globals.css` still point at the removed `apps/*` and `packages/*` trees; the live layout is `pillars/*/app/src`. The globs are stale but inert (Tailwind also auto-detects workspace packages) — fix when next touching the file.
