# PRD: Storybook

> Theme: [Foundation](../../README.md)
> Status: Done

## Overview

A single Storybook instance is the visual development and documentation surface for the entire component library and every pillar frontend. It lives inside the `@pops/ui` library (`libs/ui/.storybook`) and discovers stories from `@pops/ui` itself, sibling libraries, and every pillar's frontend app. Stories co-locate with their component — no story files live in the Storybook config itself.

Global decorators provide theme context: a light/dark toggle and an app-accent-colour switch, so any component can be previewed in every visual state without launching a real pillar.

## Architecture

```
libs/ui/
  .storybook/
    main.ts             story-discovery globs, addons, Vite config + app-* aliases
    preview.tsx         global decorators (theme + app colour), theme import
  scripts/
    check-storybook-coverage.mjs   CI guard: every frontend app has a Storybook alias
  package.json          storybook / build-storybook scripts, addons
```

- Config-only — no `*.stories.*` files live under `.storybook/`.
- The dev surface belongs to `@pops/ui`; pillar frontends are consumed through Vite `resolve.alias`, **not** workspace `package.json` dependencies. A `ui → app-*` package edge would trip the federation isolation guard and form a `tsc -b` project-reference cycle (every `@pops/app-*` already depends on `@pops/ui`).
- Built on Storybook 10 with the `@storybook/react-vite` framework and the Vite Tailwind v4 plugin, so Storybook shares the exact CSS pipeline of the real apps.

### Story Discovery

`main.ts` globs:

```typescript
stories: [
  '../src/**/*.mdx',
  '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)', // @pops/ui
  '../../*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)', // sibling libs/*
  '../../../pillars/*/*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)', // pillars/<id>/app
];
```

Frontend specifiers (`@pops/app-<id>`, `@pops/ui`, `@pops/ui/theme`) resolve through Vite aliases in `viteFinal`. Each frontend pillar app is colocated at `pillars/<pillar>/app/src`; the alias points the published package name at that source.

### Story Co-location

Stories live next to their component, and a component can carry several story files for distinct scenarios:

```
libs/ui/src/components/
  DataTable.tsx
  DataTable.stories.tsx
  DataTable.filtering.stories.tsx
```

## Data Model / Contract

Storybook has no persistent data model. The contract is the discovery + decorator surface:

| Surface            | Definition                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Story globs        | `@pops/ui` src, sibling `libs/*` src, every `pillars/<id>/app/src`                          |
| Vite aliases       | `@pops/ui`, `@pops/ui/theme`, `@pops/ui/theme/graph-colors`, one per frontend `@pops/app-*` |
| `theme` global     | `light` \| `dark` — adds/removes the `dark` class on the story wrapper                      |
| `appColour` global | `app-emerald` \| `app-indigo` \| `app-amber` \| `app-rose` \| `app-sky` \| `app-violet`     |
| Default globals    | `theme: light`, `appColour: app-emerald`                                                    |
| Addons             | `@storybook/addon-a11y`, `@chromatic-com/storybook`                                         |

The decorator wraps every story in a `<div>` carrying the selected `app-*` class (plus `dark` when dark mode is active) and paints `var(--background)` / `var(--foreground)`. The six `app-*` classes are real CSS in `libs/ui/src/theme/globals.css`, each with a `.dark` variant.

## Tooling Surface

| Command                                  | Effect                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| `mise run dev:storybook`                 | Runs Storybook dev server on port 6006 (from `libs/ui`)        |
| `pnpm --filter @pops/ui storybook`       | Same, directly                                                 |
| `pnpm --filter @pops/ui build-storybook` | Static build                                                   |
| `pnpm --filter @pops/ui test`            | Vitest + `check-storybook-coverage.mjs` (alias-coverage guard) |

## Business Rules

- Stories co-locate with their component — never in the Storybook config dir.
- Every shared component in `@pops/ui` should have at least one story (a convention, tracked as tech debt; **not** machine-enforced — see Edge Cases).
- Stories must render in both light and dark mode.
- Stories use mock / static data only — no real API calls, no client to a live pillar.
- Complex components (DataTable, forms) may have multiple story files with descriptive names.
- Every frontend `@pops/app-*` package (identified by `@pops/app-*` name + presence of `src/routes.tsx`) **must** have a matching Vite alias in `main.ts`. CI fails otherwise.

## Edge Cases

| Case                               | Behaviour                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Component has no story             | Allowed; tracked as tech debt. The CI coverage guard checks alias presence, not per-component stories. |
| New frontend pillar added          | `check-storybook-coverage.mjs` fails until a `resolve.alias` for its `@pops/app-*` is added            |
| Story needs API data               | Use static mock data (or MSW); never call a live pillar                                                |
| Multiple story files per component | Supported — descriptive filenames (e.g. `DataTable.filtering.stories.tsx`)                             |
| App-specific component stories     | Discovered from `pillars/<id>/app/src/**/*.stories.tsx`; resolved via the app's Vite alias             |
| Server-only pillar package         | Excluded — only packages named `@pops/app-*` with `src/routes.tsx` count as frontends                  |

## Acceptance Criteria

### Storybook configuration

- [x] `libs/ui/.storybook/` exists with `main.ts` and `preview.tsx`
- [x] Story globs cover `@pops/ui` src, sibling `libs/*` src, and every `pillars/<id>/app/src`
- [x] `mise run dev:storybook` starts Storybook (port 6006) without errors
- [x] Stories from `@pops/ui` appear in the Storybook sidebar
- [x] Stories from frontend pillar apps (finance, food, inventory, media, lists, …) appear in the sidebar
- [x] Storybook shares the real apps' Tailwind v4 CSS pipeline (imports `@pops/ui/theme`, runs the Tailwind Vite plugin)
- [x] No `*.stories.*` files live under `.storybook/`
- [x] `check-storybook-coverage.mjs` fails CI when a frontend `@pops/app-*` lacks a Vite alias

### Theme + app-colour decorator

- [x] A global decorator in `preview.tsx` wraps every story with theme context
- [x] Storybook toolbar has a light/dark mode toggle
- [x] Switching modes updates component styles in real time (toggles the `dark` class)
- [x] Toolbar has an app-colour dropdown: emerald, indigo, amber, rose, sky, violet
- [x] Default app colour is emerald, default theme is light, so stories render without manual selection
- [x] The six `app-*` classes map to real CSS (light + dark) in `globals.css`
- [x] `@storybook/addon-a11y` is wired for interactive accessibility checks

## Out of Scope

- Writing a story for every component (per-component coverage lives with each component's work).
- Visual regression enforcement, a Storybook-Vitest test runner, and Storybook hosting/deployment — see [docs/ideas/storybook.md](../../../../ideas/storybook.md). The `@chromatic-com/storybook` addon is installed but **not** wired into CI.

## Drift Check

last checked: 2026-06-24
