# PRD-004: Storybook

> Epic: [01 — UI Component Library](../../epics/01-ui-component-library.md)
> Status: To Review

## Overview

Set up a single Storybook instance that discovers and renders stories from all workspace packages. Stories co-locate with their components — no stories live in the Storybook app itself. Storybook is the visual development and documentation tool for the entire component library and all app-specific components.

## Architecture

```
apps/pops-storybook/
  .storybook/
    main.ts             (config — story discovery globs, addons)
    preview.ts          (global decorators, theme provider)
  package.json          (dependencies: storybook, addons)
```

- Config-only app — no story files live here
- Discovers stories from all workspace packages via globs
- Global decorators provide theme context (light/dark mode, app colour variable)

### Story Discovery

Storybook config globs:
```typescript
stories: [
  '../../packages/ui/src/**/*.stories.tsx',
  '../../packages/app-*/src/**/*.stories.tsx',
]
```

### Story Co-location

Stories live next to their component:
```
packages/ui/src/components/
  DataTable.tsx
  DataTable.stories.tsx
  DataTable.filtering.stories.tsx   (complex components can have multiple story files)
```

## Business Rules

- Every shared component in `@pops/ui` should have at least one story
- Stories co-locate with their component — never in the Storybook app
- Stories must render in both light and dark mode
- Stories must not import from tRPC or use real API calls — mock data only
- Complex components (DataTable, forms) can have multiple story files for different scenarios

## Edge Cases

| Case | Behaviour |
|------|-----------|
| Component has no story | Not a blocker for PRD-003, but tracked as tech debt |
| Story needs API data | Use MSW or static mock data — no real API calls in stories |
| Multiple story files per component | Supported — use descriptive filenames (e.g., `DataTable.filtering.stories.tsx`) |
| App-specific component stories | Discovered from `packages/app-*/src/**/*.stories.tsx` — same Storybook instance |

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-storybook-config](us-01-storybook-config.md) | Set up Storybook app with config, story discovery globs, global decorators | Partial |
| 02 | [us-02-theme-decorator](us-02-theme-decorator.md) | Global decorator for light/dark mode toggle and app colour variable | Blocked by us-01 |

## Verification

- `mise dev:storybook` / Storybook starts without errors
- All stories from `@pops/ui` are discoverable and renderable
- All stories from app packages are discoverable and renderable
- Light/dark mode toggle works in Storybook toolbar
- No console errors in Storybook

## Out of Scope

- Writing stories for every component (that's part of PRD-003 per-component USs)
- Visual regression testing (Chromatic, Percy — future enhancement)
- Storybook deployment or hosting
