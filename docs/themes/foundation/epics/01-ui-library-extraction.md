# Epic: UI Library Extraction

**Theme:** Foundation
**Priority:** 1 (do first — shell and apps both depend on this)
**Status:** Not started

## Goal

Extract shared UI components from `apps/pops-pwa/` into `packages/ui/` (`@pops/ui`) so that the shell and all app packages can consume them.

## Why first?

Both the shell extraction and every app package need to import from `@pops/ui`. If we extract the shell first, we'd have to move components twice — once into the shell, then again into a shared package. Extracting the library first means the shell and app-finance can both import from it immediately.

## Scope

### In scope

- Create `packages/ui/` workspace package with package.json, tsconfig
- Move all 28 shadcn/ui base components from `pops-pwa/src/components/ui/`
- Move shared composite components: DataTable, DataTableFilters, InfiniteScrollTable, Autocomplete, ComboboxSelect, Select, DropdownMenu, EditableCell, ChipInput, ErrorBoundary
- Move form inputs: TextInput, NumberInput, DateTimeInput, CheckboxInput, RadioInput, Chip
- Move shared utilities: `cn()`, formatters
- Move Tailwind CSS variables and shared theme config
- Establish design token system: colours, spacing, typography, breakpoints, shadows. All apps consume tokens from `@pops/ui` — no arbitrary Tailwind values allowed (see [ADR-004](../../architecture/adr-004-tailwind-only-styling.md))
- Audit existing components for arbitrary values (`w-[...]`, `text-[#...]`, etc.) and replace with tokens
- Move associated stories with each component
- Update all imports in pops-pwa to use `@pops/ui`
- Ensure Storybook continues to work (stories stay with components, Storybook config updated to discover from packages/)

### Out of scope

- Import wizard components (domain-specific, stays in finance)
- TagEditor (finance-specific for now)
- Page components
- Zustand stores
- Any new components

## Deliverables

1. `packages/ui/` package exists with all shared components
2. `apps/pops-pwa/` imports from `@pops/ui` — no shared components remain in pops-pwa
3. All existing stories pass in Storybook
4. `yarn typecheck` passes across all packages
5. `yarn build` produces working output
6. Zero runtime regressions — finance app works exactly as before

## Dependencies

- None (this is the first epic)

## Risks

- **Import path churn** — Every file that imports a shared component needs updating. Automated with find-and-replace, but easy to miss one.
- **Tailwind config** — Tailwind v4 uses CSS-first config. Need to ensure the shared CSS variables are properly consumed by downstream packages.
- **Storybook discovery** — Storybook config needs to glob across workspace packages. May need `.storybook/main.ts` updates.
