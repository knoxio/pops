# PRD-007: App Theme Colour Propagation

> Epic: [02 — Shell & App Switcher](../../epics/02-shell-app-switcher.md)
> Status: To Review

## Overview

Build the mechanism that propagates an app's declared theme colour to all components within that app. When the user navigates to Media (indigo), every component that uses `bg-app-accent` automatically renders in indigo. When they switch to Finance (emerald), those same components render in emerald. No component knows which app it's in — the shell handles the propagation.

## How It Works

1. Each app declares a `color` in its `navConfig` (e.g., `color: "indigo"`)
2. The shell detects the active app from the current URL path
3. The shell sets `--app-accent` and `--app-accent-foreground` CSS variables on the app's container element
4. All nested components that use `bg-app-accent`, `text-app-accent`, etc. pick up the colour automatically via CSS cascade

### Colour Mapping

| App colour | `--app-accent` value | Usage |
|------------|---------------------|-------|
| emerald | emerald-500 (light) / emerald-400 (dark) | Finance |
| indigo | indigo-500 / indigo-400 | Media |
| amber | amber-500 / amber-400 | Inventory |
| rose | rose-500 / rose-400 | (future) |
| sky | sky-500 / sky-400 | (future) |
| violet | violet-500 / violet-400 | AI |
| (none) | primary | Default fallback |

Each colour also needs a `--app-accent-foreground` for text-on-accent (typically white or near-white).

## Business Rules

- The shell is the only thing that sets `--app-accent` — app packages never set it directly
- Components in `@pops/ui` use `bg-app-accent` / `text-app-accent` — they don't know which colour they'll get
- The colour must propagate to all nested components without manual prop drilling
- Opacity modifiers must work (`bg-app-accent/10`, `text-app-accent/80`)
- App rail active indicator also uses the app's accent colour
- The colour updates instantly on app switch — no flash or delay

## Data Model

No database changes. The colour is declared in the app's `navConfig` (already part of the `AppNavConfig` type from PRD-006).

## Edge Cases

| Case | Behaviour |
|------|-----------|
| App has no `color` declared | Falls back to `--primary` |
| Component used outside an app context (e.g., shell chrome) | Uses `--primary` fallback |
| Transition between apps | CSS variable update is instant — no animation needed on the variables themselves, but components may animate their own transitions |
| Storybook | Theme decorator (PRD-004 US-02) provides a colour picker to preview any app colour |

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-shell-propagation](us-01-shell-propagation.md) | Shell reads active app's colour from navConfig and sets CSS variables on the app container | Done | No (first) |
| 02 | [us-02-rail-accent](us-02-rail-accent.md) | App rail active indicator uses the active app's accent colour | Partial | Blocked by us-01 |
| 03 | [us-03-verify-components](us-03-verify-components.md) | Verify all components using app-accent tokens render correctly across all app colours | Partial | Blocked by us-01 |

## Verification

- Navigating to Finance shows emerald accents throughout
- Navigating to Media shows indigo accents throughout
- Navigating to Inventory shows amber accents throughout
- Components in `@pops/ui` never reference specific colour names (no `bg-indigo-600`)
- `grep` for hardcoded app colours in `@pops/ui` returns zero hits
- Opacity modifiers work (`bg-app-accent/10`)
- App with no declared colour falls back to primary
- Light and dark mode both work for all app colours

## Out of Scope

- The CSS variable definitions themselves (PRD-002 US-02)
- Replacing hardcoded colours in app packages (PRD-002 US-04)
- Per-page colour overrides within an app
