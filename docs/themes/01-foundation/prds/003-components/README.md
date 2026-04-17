# PRD-003: Components

> Epic: [01 — UI Component Library](../../epics/01-ui-component-library.md)
> Status: Partial

## Overview

Build `@pops/ui` as a workspace package containing all shared UI components — Shadcn/Radix primitives, composite form inputs, data display components, and utility components. Every app imports shared components from this package. Domain-specific components stay in their app packages.

## Package Configuration

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
- Barrel `index.ts` exports all composites and primitives

## Package Structure

```
packages/ui/
  package.json              (@pops/ui)
  tsconfig.json
  src/
    index.ts                (barrel export)
    primitives/             (shadcn/ui base components, stories co-located)
    components/             (composite components, stories co-located)
    theme/                  (globals.css — see PRD-002)
    lib/
      utils.ts              (cn() utility)
```

## Component Classification

### Shared (in @pops/ui)

| Category   | Components                                                                                                                                                                                                                                                                  | Count  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Primitives | Accordion, AlertDialog, Alert, Avatar, Badge, Breadcrumb, Button, Card, Checkbox, Collapsible, Command, Dialog, DropdownMenu, Input, Label, Popover, Progress, RadioGroup, Select, Separator, Skeleton, Slider, Sonner, Switch, Table, Tabs, Textarea, Tooltip              | 28     |
| Composites | Autocomplete, Button (wrapper), CheckboxInput, Chip, ChipInput, ComboboxSelect, DataTable, DataTableFilters, DateTimeInput, DropdownMenu (wrapper), EditableCell, ErrorBoundary, InfiniteScrollTable, NumberInput, RadioInput, Select (wrapper), TextInput, ViewToggleGroup | 18     |
| Utilities  | `cn()` from lib/utils.ts                                                                                                                                                                                                                                                    | 1      |
| **Total**  |                                                                                                                                                                                                                                                                             | **47** |

### Domain-specific (stay in app packages)

| Component                                | Package               | Why                                              |
| ---------------------------------------- | --------------------- | ------------------------------------------------ |
| ImportWizard + all wizard steps          | `@pops/app-finance`   | Finance-specific import flow                     |
| TagEditor                                | `@pops/app-finance`   | Uses tRPC finance procedures for tag suggestions |
| EntityCreateDialog                       | `@pops/app-finance`   | Finance entity creation                          |
| TransactionCard, EditableTransactionCard | `@pops/app-finance`   | Finance-specific display                         |
| MediaCard, MediaGrid, DiscoverCard       | `@pops/app-media`     | Media-specific display                           |
| InventoryCard, InventoryTable            | `@pops/app-inventory` | Inventory-specific display                       |
| ComparisonScores, RadarChart             | `@pops/app-media`     | Media comparisons                                |

**Rule:** If a component is used by 2+ apps, it moves to `@pops/ui`. If it uses domain-specific tRPC procedures or stores, it stays in its app package.

## Import API

```typescript
// Composite components
import { DataTable, TextInput, Button, ViewToggleGroup } from '@pops/ui';

// Primitives (if needed directly)
import { Card, CardHeader, CardContent } from '@pops/ui';

// Utility
import { cn } from '@pops/ui';
```

## Action Icon Standards

All interactive actions use [Lucide React](https://lucide.dev) icons. Text-only action labels are not permitted — actions must use an icon (icon-only with `aria-label`, or icon + text).

| Action          | Icon                            | Notes                    |
| --------------- | ------------------------------- | ------------------------ |
| Add / Create    | `Plus`                          | Add item, create new     |
| Edit            | `Pencil`                        | Not `Edit2` or `PenLine` |
| Delete / Remove | `Trash2`                        | Not `Trash`              |
| Close / Dismiss | `X`                             | Close dialog, cancel     |
| Save / Confirm  | `Check`                         | Save changes             |
| Move up / down  | `ArrowUp` / `ArrowDown`         | Reorder                  |
| Expand          | `ChevronDown` or `ChevronRight` | Show details             |
| Search          | `Search`                        | Search input             |
| Settings        | `Settings`                      | Open settings            |
| External link   | `ExternalLink`                  | Open in new tab          |

One icon per action, no aliases. Destructive actions use `variant="ghost"` with `text-destructive` styling.

**Icon button pattern (compact actions):**

```tsx
<Button variant="ghost" size="icon" aria-label="Remove from watchlist">
  <Trash2 className="h-4 w-4" />
</Button>
```

**Icon + text (prominent actions):**

```tsx
<Button>
  <Plus className="h-4 w-4 mr-2" /> Add Item
</Button>
```

## ViewToggleGroup Component

Reusable table/grid view toggle for any list page (inventory items, media library, watchlist, history).

```tsx
interface ViewToggleGroupProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}
```

- Default options: `LayoutList` (table) and `LayoutGrid` (grid) from Lucide
- Rendering: Segmented button group (pill shape, muted background, active item elevated)
- Placement: Directly above the content it controls — in the toolbar, not in the page header
- Persistence: Selection saved to `localStorage` with page-specific key (e.g., `inventory-view-mode`)

## Business Rules

- Components consume design tokens from PRD-002 — no hardcoded colours or arbitrary values
- Components use `bg-app-accent` for app-specific accent colours, not hardcoded colour classes
- All components must work in both light and dark mode
- All interactive elements meet 44x44px touch target minimum (see PRD-010)
- Stories co-locate with their component files

## Edge Cases

| Case                                   | Behaviour                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Custom Button wraps primitive button   | Both in `@pops/ui`. Primitive at `primitives/button.tsx`, wrapper at `components/Button.tsx`. Barrel exports the wrapper as `Button` |
| Components without stories             | Move to `@pops/ui` without stories. Missing stories are tech debt, not a blocker                                                     |
| TagEditor uses tRPC finance procedures | Stays in `@pops/app-finance`. If other apps need tagging, extract a generic version later                                            |
| Component needs new design token       | Add token to `@theme` in PRD-002's globals.css — don't use arbitrary values                                                          |
| Path aliases                           | `@pops/ui` uses `@ui/*` internally. Cross-package imports always use package name `@pops/ui`                                         |

## User Stories

| #   | Story                                                   | Summary                                                                                                                                | Status                                                                                                               | Parallelisable                 |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| 01  | [us-01-package-scaffold](us-01-package-scaffold.md)     | Create @pops/ui workspace package with config, tsconfig, barrel export                                                                 | Done                                                                                                                 | No (first)                     |
| 02  | [us-02-primitives](us-02-primitives.md)                 | Build all 28 Shadcn/Radix primitive components with co-located stories                                                                 | Done                                                                                                                 | Blocked by us-01               |
| 03  | [us-03-form-inputs](us-03-form-inputs.md)               | Build composite form inputs: TextInput, NumberInput, DateTimeInput, CheckboxInput, RadioInput, ChipInput, Autocomplete, ComboboxSelect | Done                                                                                                                 | Blocked by us-01               |
| 04  | [us-04-data-display](us-04-data-display.md)             | Build data display composites: DataTable, DataTableFilters, InfiniteScrollTable, EditableCell, ViewToggleGroup                         | Partial — most components done; StatCard missing trend prop, stories, and uses arbitrary OKLCH values (#1794, #1795) | Blocked by us-01               |
| 05  | [us-05-utility-components](us-05-utility-components.md) | Build utility composites: Button wrapper, Chip, DropdownMenu wrapper, Select wrapper, ErrorBoundary, StatCard                          | Done                                                                                                                 | Blocked by us-01               |
| 06  | [us-06-icon-standards](us-06-icon-standards.md)         | Enforce action icon standards across all existing components and app packages                                                          | Partial — core icons done; text-only labels, destructive patterns, compact/prominent sweep incomplete (#1798)        | Blocked by us-02 through us-05 |

US-02 through US-05 can all be built in parallel after US-01. US-06 is a sweep after components exist.

## Verification

Every US is only done when:

- `pnpm typecheck` passes across all packages
- `pnpm lint` passes
- `pnpm build` succeeds
- `pnpm dev` serves the app with no visual regressions
- Storybook renders all component stories correctly
- Light and dark mode both work

## Out of Scope

- Design tokens and theming (PRD-002)
- Storybook configuration (PRD-004)
- Responsive design audit (PRD-010)
- Domain-specific components (stay in app packages)

## Drift Check

last checked: 2026-04-17
