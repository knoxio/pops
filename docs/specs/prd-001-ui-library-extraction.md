# PRD-001: UI Library Extraction

**Epic:** [01 — UI Library Extraction](../themes/foundation/epics/01-ui-library-extraction.md)
**Theme:** Foundation
**Status:** Approved
**ADRs:** [002 — Shell Architecture](../architecture/adr-002-shell-architecture.md), [003 — Component Library & API](../architecture/adr-003-component-library-and-api.md), [004 — Tailwind-Only Styling](../architecture/adr-004-tailwind-only-styling.md)

## Problem Statement

All shared UI components currently live in `apps/pops-pwa/src/components/`. As POPS expands to multiple app packages (media, inventory, fitness, etc.), each app needs to import shared components from a common package. Without extraction, we'd either duplicate components across apps or keep everything in a monolithic frontend.

## Goal

Create `packages/ui/` (`@pops/ui`) containing all shared components, the design token system, and utilities. After extraction, `pops-pwa` imports from `@pops/ui` and contains only finance-specific components. The foundation is set for the shell extraction (Epic 2) and all future app packages.

## Requirements

### R1: Package Structure

Create `packages/ui/` as a Yarn workspace package.

```
packages/ui/
  package.json              (@pops/ui)
  tsconfig.json
  src/
    index.ts                (public API barrel export)
    primitives/             (shadcn/ui base components, stories co-located)
      accordion.tsx
      accordion.stories.tsx
      alert-dialog.tsx
      alert.tsx
      alert.stories.tsx
      avatar.tsx
      avatar.stories.tsx
      badge.tsx
      badge.stories.tsx
      breadcrumb.tsx
      breadcrumb.stories.tsx
      button.tsx
      card.tsx
      card.stories.tsx
      checkbox.tsx
      collapsible.tsx
      command.tsx
      dialog.tsx
      dialog.stories.tsx
      dropdown-menu.tsx
      input.tsx
      label.tsx
      popover.tsx
      progress.tsx
      progress.stories.tsx
      radio-group.tsx
      select.tsx
      separator.tsx
      separator.stories.tsx
      skeleton.tsx
      skeleton.stories.tsx
      slider.tsx
      slider.stories.tsx
      sonner.tsx
      switch.tsx
      switch.stories.tsx
      table.tsx
      tabs.tsx
      tabs.stories.tsx
      textarea.tsx
      textarea.stories.tsx
      tooltip.tsx
      tooltip.stories.tsx
    components/             (composite components)
      Autocomplete.tsx
      Autocomplete.stories.tsx
      Button.tsx
      Button.stories.tsx
      CheckboxInput.tsx
      CheckboxInput.stories.tsx
      Chip.tsx
      Chip.stories.tsx
      ChipInput.tsx
      ChipInput.stories.tsx
      ComboboxSelect.tsx
      ComboboxSelect.stories.tsx
      DataTable.tsx
      DataTable.stories.tsx
      DataTable.filtering.stories.tsx
      DataTableFilters.tsx
      DateTimeInput.tsx
      DateTimeInput.stories.tsx
      DropdownMenu.tsx
      DropdownMenu.stories.tsx
      EditableCell.tsx
      ErrorBoundary.tsx
      InfiniteScrollTable.tsx
      InfiniteScrollTable.stories.tsx
      NumberInput.tsx
      NumberInput.stories.tsx
      RadioInput.tsx
      RadioInput.stories.tsx
      Select.tsx
      TextInput.tsx
      TextInput.stories.tsx
    theme/
      globals.css           (Tailwind imports, @theme block, CSS variables, light/dark tokens)
      tokens.ts             (TypeScript constants for any tokens needed in JS — optional)
    lib/
      utils.ts              (cn() utility)
```

### R2: Component Classification

Components are classified as **shared** (→ `@pops/ui`) or **domain-specific** (→ stays in finance).

**Shared (move to @pops/ui):**

| Category | Components | Count |
|----------|-----------|-------|
| Primitives | All 28 shadcn/ui components in `ui/` | 28 |
| Composite | Autocomplete, Button, CheckboxInput, Chip, ChipInput, ComboboxSelect, DataTable, DataTableFilters, DateTimeInput, DropdownMenu, EditableCell, ErrorBoundary, InfiniteScrollTable, NumberInput, RadioInput, Select, TextInput | 17 |
| Utilities | `cn()` from lib/utils.ts | 1 |
| Theme | globals.css (CSS variables, @theme block, Tailwind config) | 1 |
| Stories | All story files for the above components | 28 |
| **Total** | | **75 files** |

**Domain-specific (stays in finance app):**

| Category | Components | Count |
|----------|-----------|-------|
| Import Wizard | ImportWizard, UploadStep, ColumnMapStep, ProcessingStep, ReviewStep, TagReviewStep, SummaryStep, FileUpload, EntityCreateDialog, TransactionCard, EditableTransactionCard, TransactionGroup, LocationField | 13 |
| Finance-specific | TagEditor (uses tRPC finance procedures) | 1 |
| Stores | importStore (import wizard state) | 1 |
| Utilities | transaction-utils.ts | 1 |
| Stories | TagEditor.stories.tsx, TagReviewStep.stories.tsx | 2 |
| **Total** | | **18 files** |

### R3: Design Token System

Per ADR-004, all styling must use Tailwind classes with values from the design token system. No arbitrary values.

**Current state:** 19 files use arbitrary Tailwind values. These fall into three categories:

1. **Layout dimensions** (`w-[180px]`, `min-w-[120px]`, `w-[70px]`, etc.) — Replace with Tailwind scale values or named tokens in the `@theme` block.
2. **Radix UI CSS variable references** (`w-[var(--radix-popover-trigger-width)]`) — These are acceptable. They bind to runtime values from Radix and cannot be replaced with static tokens. Document as the one permitted exception.
3. **Centering/transform hacks** (`top-[50%]`, `translate-x-[-50%]`, etc.) — Replace with Tailwind's built-in centering utilities (`inset-0 flex items-center justify-center`, or `place-items-center`).

**Action per file:**

| File | Arbitrary Values | Action |
|------|-----------------|--------|
| ChipInput.tsx | `min-w-[120px]` | Replace with `min-w-30` |
| Autocomplete.tsx | `w-[var(--radix-...)]` | Keep (Radix runtime binding) |
| ComboboxSelect.tsx | `w-[var(--radix-...)]` | Keep (Radix runtime binding) |
| DataTableFilters.tsx | `w-[180px]`, `min-w-[200px]`, `w-[150px]`, `w-[100px]` | Replace with `w-45`, `min-w-50`, `w-38`, `w-25` |
| DataTable.tsx | `w-[70px]` | Replace with `w-18` |
| EditableCell.tsx | `min-h-[2rem]` | Replace with `min-h-8` |
| dialog.tsx | `max-w-[calc(...)]`, centering | Refactor centering approach |
| alert-dialog.tsx | Same as dialog | Refactor centering approach |
| command.tsx | `max-h-[300px]` | Replace with `max-h-75` |
| switch.tsx | `h-[1.15rem]` | Replace with closest token or add custom token |
| tabs.tsx | `p-[3px]`, `bottom-[-5px]` | Replace with tokens or add custom tokens |
| tooltip.tsx | `translate-y-[calc(...)]` | Evaluate if avoidable |
| dropdown-menu.tsx | `p-[3px]` | Same as tabs |
| select.tsx | Radix CSS var refs | Keep (Radix runtime binding) |
| Story files | Various `w-[...]` | Replace with Tailwind scale values |

**Exception rule:** `w-[var(--radix-*)]` and similar Radix UI CSS variable bindings are permitted since they reference runtime-computed values, not design tokens.

### R4: Package Configuration

**package.json:**
```json
{
  "name": "@pops/ui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./theme": "./src/theme/globals.css",
    "./primitives/*": "./src/primitives/*"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- No build step — consumed as source via Vite workspace resolution
- Peer dependencies on React (not bundled)
- Named exports for theme CSS and individual primitives if needed
- The barrel `index.ts` exports all composite components and primitives

**tsconfig.json:** Extends a shared base or mirrors the current PWA config. Strict mode, path alias `@ui/*` → `src/*`.

### R5: Import API

After extraction, consumer code imports like:

```typescript
// Composite components
import { DataTable, TextInput, Button } from '@pops/ui'

// Primitives (if needed directly)
import { Card, CardHeader, CardContent } from '@pops/ui'

// Utility
import { cn } from '@pops/ui'
```

Theme CSS is imported once in the shell's entry point:
```typescript
import '@pops/ui/theme'
```

### R6: Storybook Integration

- Stories co-locate with their component files in `@pops/ui`
- The Storybook config (currently in `apps/pops-pwa/.storybook/`) discovers stories from `packages/ui/src/**/*.stories.tsx`
- All existing stories must continue to work after migration
- No stories live in the Storybook app — it's config only

### R7: Tailwind Integration

- `globals.css` moves to `packages/ui/src/theme/globals.css`
- Contains: `@import "tailwindcss"`, `@theme` block, CSS variables, light/dark mode tokens
- The shell (and later each app) imports this CSS file
- Tailwind v4 content detection automatically finds classes in workspace packages — no manual `content` config needed
- Apps do NOT define their own theme tokens — they consume from `@pops/ui`

## Out of Scope

- Creating the shell (Epic 2)
- Moving layout components (RootLayout, TopBar, Sidebar) — these go to the shell, not the UI library
- Moving page components
- Moving Zustand stores
- Moving tRPC client config
- Building new components
- Responsive design audit (Epic 5)

## Acceptance Criteria

1. `packages/ui/` exists as a workspace package and is resolvable by other packages
2. All 28 primitives and 17 composite components are in `@pops/ui`
3. All associated stories are co-located with their components in `@pops/ui`
4. `apps/pops-pwa/` imports shared components from `@pops/ui` — no shared components remain in `pops-pwa/src/components/`
5. `pops-pwa/src/components/` contains only finance-specific components (imports/ directory + TagEditor)
6. Design token system is in `@pops/ui/theme` — CSS variables, @theme block, light/dark tokens
7. All arbitrary Tailwind values replaced with token-based classes (except Radix CSS variable bindings)
8. `yarn typecheck` passes across all packages
9. `yarn lint` passes across all packages
10. `yarn format:check` passes across all packages
11. `yarn build` succeeds
10. `yarn dev` serves the app with no regressions
11. Storybook discovers and renders all stories from `@pops/ui`
12. All existing tests pass (unit + E2E)

## Edge Cases & Decisions

**Q: What about the custom Button.tsx that wraps ui/button.tsx?**
A: Both move to `@pops/ui`. The primitive goes to `primitives/button.tsx`, the wrapper goes to `components/Button.tsx`. The barrel export exposes the wrapper as `Button` and the primitive as `ButtonPrimitive` if direct access is needed.

**Q: What about components with no stories (DataTableFilters, EditableCell, ErrorBoundary, Select)?**
A: They move to `@pops/ui` without stories. Adding stories is not in scope for this PRD — it's tech debt to address later.

**Q: TagEditor — shared or domain-specific?**
A: Domain-specific for now. It imports from `trpc` to fetch tag suggestions, which ties it to finance. If other apps need tagging, we'll extract a generic version later.

**Q: What about the `@` path alias?**
A: `@pops/ui` components use `@ui/` as their internal path alias. Consumer packages continue using their own aliases. Cross-package imports always use the package name (`@pops/ui`), never path aliases.

## User Stories

> **Standard verification — applies to every US below:**
> Each story is only done when `yarn typecheck`, `yarn lint`, `yarn format:check`, `yarn test`, and `yarn build` all pass. No story is merged with broken checks or failing tests.

### US-1: Create @pops/ui package scaffold
**As a** developer, **I want** the `@pops/ui` workspace package to exist with correct configuration **so that** other packages can depend on it.

**Acceptance criteria:**
- `packages/ui/package.json` exists with correct name, exports, peer deps
- `packages/ui/tsconfig.json` exists with strict mode
- `packages/ui/src/index.ts` exists (empty barrel initially)
- `yarn install` resolves the workspace package

### US-2: Extract design token system
**As a** developer, **I want** the Tailwind theme (CSS variables, @theme block, light/dark tokens) in `@pops/ui/theme` **so that** all packages share one source of truth for design tokens.

**Acceptance criteria:**
- `packages/ui/src/theme/globals.css` contains the full theme from current `pops-pwa/src/styles/globals.css`
- `pops-pwa` imports the theme from `@pops/ui/theme`
- Light and dark mode work exactly as before
- No theme-related CSS remains in `pops-pwa`

### US-3: Extract primitive components
**As a** developer, **I want** all 28 shadcn/ui primitives in `@pops/ui/primitives/` **so that** any app can use base UI elements.

**Acceptance criteria:**
- All 28 primitives moved to `packages/ui/src/primitives/`
- All re-exported from `packages/ui/src/index.ts`
- All imports in `pops-pwa` updated to `@pops/ui`
- Storybook renders primitive stories correctly
- No primitive components remain in `pops-pwa/src/components/ui/`

### US-4: Extract composite components
**As a** developer, **I want** all 17 shared composite components in `@pops/ui/components/` **so that** any app can use DataTable, form inputs, etc.

**Acceptance criteria:**
- All 17 composites moved to `packages/ui/src/components/`
- Stories co-located with each component
- All re-exported from barrel
- All imports in `pops-pwa` updated
- `cn()` utility moved to `packages/ui/src/lib/utils.ts`
- No shared composites remain in `pops-pwa/src/components/`

### US-5: Eliminate arbitrary Tailwind values
**As a** developer, **I want** all arbitrary Tailwind values replaced with token-based classes **so that** the design system is consistent and enforced.

**Acceptance criteria:**
- All `w-[Npx]`, `h-[Npx]`, `p-[Npx]`, etc. replaced with Tailwind scale values
- Centering hacks in dialog/alert-dialog replaced with built-in utilities
- Radix CSS variable bindings (`w-[var(--radix-*)]`) documented as permitted exception
- No new arbitrary values introduced
- Add ESLint rule or Storybook check to prevent future arbitrary values (stretch goal)

### US-6: Update Storybook configuration
**As a** developer, **I want** Storybook to discover stories from `@pops/ui` **so that** all component stories are browsable in one place.

**Acceptance criteria:**
- Storybook config updated to glob `packages/ui/src/**/*.stories.tsx`
- All existing stories render correctly
- No stories moved to or created in the Storybook app itself

### US-7: Final verification
**As a** developer, **I want** confirmation that the full extraction is complete with no regressions **so that** we can move to Epic 2.

**Acceptance criteria:**
- `yarn dev` serves the app with no visual regressions
- All E2E tests pass (Playwright)
- `pops-pwa/src/components/` contains only: `imports/` directory, `TagEditor.tsx`, `TagEditor.stories.tsx`
