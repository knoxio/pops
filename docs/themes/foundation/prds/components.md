# Components

> Theme: [Foundation](../README.md)
> Status: Partial

## Purpose

`@pops/ui` is the single shared component library. It lives at `libs/ui/` and is
consumed as source (no build step) by every pillar frontend (`@pops/app-*`) and
by the shell. It provides three layers:

- **Primitives** — Shadcn/Radix-based, accessible, unstyled-but-tokenised base
  elements (Button, Card, Dialog, Input, …).
- **Composites** — higher-level components assembled from primitives (form
  inputs, `DataTable`, badges, dialogs, view toggles, charts, …).
- **Utilities** — `cn()`, formatting helpers, debounce hooks, colour hashing.

A component belongs in `@pops/ui` when it is used by **2+ frontends** or is
domain-agnostic. Domain-specific components stay inside their owning pillar's
`pillars/<pillar>/app/src/components/`.

This library is the platform's design-system surface. Tokens and theming come
from [Design Tokens & Theming](design-tokens-theming.md); Storybook
(the dev/render surface) is its own PRD; the responsive/touch-target rules come
from the responsive-foundation PRD.

## Package Contract

`@pops/ui` (`libs/ui/package.json`):

```jsonc
{
  "name": "@pops/ui",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./theme": { "types": "./src/theme/globals.d.ts", "default": "./src/theme/globals.css" },
    "./theme/graph-colors": "./src/theme/graph-colors.ts",
    "./primitives/*": "./src/primitives/*",
  },
  "peerDependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" },
}
```

- **No build step.** Consumers resolve `@pops/ui` to `src/` via Vite workspace
  resolution; the barrel `src/index.ts` is the public API.
- **React is a peer dependency** — never bundled.
- Internal imports use relative paths; cross-package imports always use the
  package name `@pops/ui` (and `@pops/ui/primitives/*` / `@pops/ui/theme` for the
  explicit subpath exports).
- `@pops/ui` depends on `@pops/types`. It must **not** import any `@pops/app-*`
  or pillar package — that would trip the federation isolation guard
  (`scripts/ci/check-lib-no-pillar-import.mjs`) and create a `tsc -b` reference
  cycle. The dependency direction is strictly `app-* → ui`, never the reverse.

### Source layout

```
libs/ui/src/
  index.ts            barrel — the public API
  primitives/         shadcn/Radix base elements (+ co-located *.stories.tsx)
  components/         composites (+ co-located *.stories.tsx / *.test.tsx)
  hooks/              shared hooks (useImageProcessor)
  lib/                cn(), format, useDebounce, hashToColor, highlightMatch
  theme/              globals.css, globals.d.ts, graph-colors.ts (design tokens)
  test-setup.ts
```

## Public Surface

### Primitives

`Accordion`, `Alert`, `AlertDialog`, `Avatar`, `Badge`, `Breadcrumb`, `Button`
(exported from the barrel as `ButtonPrimitive` + `buttonVariants` to avoid the
composite collision), `Card`, `Checkbox`, `Collapsible`, `Command`, `Dialog`,
`DropdownMenu` (barrel-aliased part exports, root as `DropdownMenuRoot`),
`Input`, `Label`, `Popover`, `Progress`, `RadioGroup`, `Select` (root as
`SelectPrimitive`), `Separator`, `Skeleton`, `Slider`, `Sonner`/`Toast`,
`Switch`, `Table`, `Tabs`, `Textarea`, `Tooltip`.

Primitives whose name collides with a composite (`Button`, `DropdownMenu`,
`Select`) are re-exported under aliases; import the raw primitive via
`@pops/ui/primitives/<name>` when needed.

### Composites

Form inputs: `TextInput`, `NumberInput`, `DateTimeInput`, `DurationFieldInput`,
`CheckboxInput`, `RadioInput`, `ChipInput`, `Autocomplete`, `ComboboxSelect`,
`Select` (wrapper), `EntitySelect`, `SettingsForm`.

Data display: `DataTable`, `DataTableFilters`, `InfiniteScrollTable`,
`EditableCell`, `EditableFormCard`, `ViewToggleGroup`, `StatCard`,
`SummaryCard`, `TreeView`, `TreePicker`, `SortableGrid`, `TierListBoard`.

Charts / media: `BreakdownChart`, `RadarChart`, `ForceGraph`, `ImageGallery`,
`MediaCard`, `ScrollShelf`, `ResponsiveCardGrid`, `ImageWithFallback`.

Actions / layout / feedback: `Button` (composite wrapper), `Chip`,
`DropdownMenu` (wrapper), `ActionGroup`, `ActionButtonWithDetailPicker`,
`ResponsiveActionBar`, `ConditionalModalButton`, `CardWithActionOverlay`,
`PageHeader`, `ContainerPanel`, `EmptyState`, `EmptyStateTab`, `ErrorBoundary`,
`ErrorAlert`, `LoadingProgressStep`, `CompletionSummary`, `SkeletonGrid`,
`SearchPickerDialog`, `SearchResultItem`, `RequestDialog`, `WorkflowDialog`,
`CRUDManagementSection`, `RelatedItemsList`, `FileUpload`, `UriCard`.

Badges / inventory: `AssetIdBadge`, `ConditionBadge`, `TypeBadge`,
`WarrantyBadge`, `LocationBreadcrumb`.

### Utilities

`cn`, `useDebouncedValue`, `useDebouncedCallback`, `formatCurrency`,
`formatAUD`, `formatUSD`, `formatDate`, `formatBytes`, `formatRelativeTime`,
`highlightMatch`, `hashToColor`, `useImageProcessor`.

> The barrel is the source of truth and grows as components are extracted. The
> lists above are illustrative of the current shape, not a fixed contract.

## Component Classification

A component is **shared** (`@pops/ui`) when 2+ frontends use it, or it is
domain-agnostic. It is **domain-specific** (stays in `pillars/<pillar>/app`)
when it is bound to one pillar's data, contract, or store.

| Component                                 | Home                    | Why                                 |
| ----------------------------------------- | ----------------------- | ----------------------------------- |
| `TagEditor`                               | `pillars/finance/app`   | Calls finance contract for tag data |
| `ImportWizard` + steps                    | `pillars/finance/app`   | Finance-specific import flow        |
| `ComparisonScores`, `ComparisonMovieCard` | `pillars/media/app`     | Media-specific comparison view      |
| `DiscoverCard`, `MediaGrid`               | `pillars/media/app`     | Media-specific display              |
| `InventoryCard`, `InventoryTable`         | `pillars/inventory/app` | Inventory-specific display          |
| `MediaCard`, `RadarChart`                 | `@pops/ui` (promoted)   | Re-used by 2+ surfaces → shared     |

Promotion is one-directional: when a second frontend needs a domain component, a
generic version is extracted into `@pops/ui` (as happened for `MediaCard` and
`RadarChart`). The pillar may keep a thin domain wrapper.

## Design & Accessibility Rules

- Components consume design tokens from the
  [Design Tokens & Theming](design-tokens-theming.md) PRD — **no
  hardcoded colours, no arbitrary Tailwind values**.
- App-accent surfaces use the `bg-app-accent` / `text-app-accent` token family
  (driven by `--app-accent`, set per `.app-*` theme class), never a hardcoded
  colour class.
- Every component works in **both light and dark mode** (`.dark` variant +
  `.app-*` overrides defined in `theme/globals.css`).
- Interactive elements meet the **44×44px** minimum touch target (responsive
  foundation).
  Smaller visual sizes (`xs`/`sm`/`icon-xs`/`icon-sm`) expand the tappable area
  with a `before:` pseudo-element rather than growing the visual element. This is
  asserted by `primitives/touch-targets.test.ts`.
- Stories co-locate with their component (`Foo.stories.tsx` beside `Foo.tsx`).
  Missing stories are tech debt, not a blocker to landing a component.

## Action Icon Standards

POPS uses **Lucide React** as the single icon library — no other icon set is
permitted. Every interactive action carries an icon: icon-only (with
`aria-label`) for compact contexts, or icon + text for prominent CTAs. Text-only
action labels are not permitted.

| Action          | Icon                              | Banned alternatives |
| --------------- | --------------------------------- | ------------------- |
| Add / Create    | `Plus`                            |                     |
| Edit            | `Pencil`                          | `Edit2`, `PenLine`  |
| Delete / Remove | `Trash2`                          | `Trash`             |
| Close / Dismiss | `X`                               |                     |
| Save / Confirm  | `Check`                           |                     |
| Move up / down  | `ArrowUp` / `ArrowDown`           |                     |
| Expand          | `ChevronDown` / `ChevronRight`    |                     |
| More actions    | `MoreHorizontal` / `MoreVertical` | `Ellipsis`          |
| Search          | `Search`                          |                     |
| Settings        | `Settings`                        | `Cog`, `Gear`       |
| Back / Navigate | `ArrowLeft` / `ChevronLeft`       |                     |
| External link   | `ExternalLink`                    |                     |
| Download        | `Download`                        |                     |
| Upload          | `Upload`                          |                     |
| Refresh         | `RefreshCw`                       | `RefreshCcw`        |

One icon per action, no aliases. Destructive actions use `variant="ghost"` with
`text-destructive` styling.

```tsx
// Compact (table rows, list items): icon-only + aria-label
<Button size="icon" aria-label="Delete item">
  <Trash2 className="h-4 w-4" />
</Button>

// Prominent (page CTAs, form buttons): icon + text
<Button>
  <Plus className="h-4 w-4 mr-2" /> Add Item
</Button>
```

- Icon-only buttons **must** have an `aria-label` (not just `title`); `title` may
  be added alongside for sighted hover tooltips.
- Navigation icons are registered in the shared shell registry
  `pillars/shell/src/app/nav/icon-map.ts`; all nav uses Lucide icons from there.

> The icon vocabulary is a **convention**, not yet a lint-enforced rule (oxlint
> carries no `no-restricted-imports` entry for banned icon names). Enforcement
> automation is tracked as an idea — see
> [docs/ideas/components.md](../../../ideas/components.md).

## ViewToggleGroup

Segmented table/grid toggle for any list page. Generic over the option value
type, supports controlled and uncontrolled use, and persists the selection to
`localStorage` under a page-specific key.

```ts
interface ViewToggleOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

interface ViewToggleGroupProps<T extends string> {
  options: ViewToggleOption<T>[];
  value?: T; // controlled
  defaultValue?: T; // uncontrolled initial
  onChange?: (value: T) => void;
  storageKey?: string; // e.g. "inventory-view-mode"
  className?: string;
}
```

- Default usage pairs `LayoutList` (table) and `LayoutGrid` (grid) Lucide icons.
- Rendered directly above the content it controls (toolbar), not in the page
  header.
- Initial value precedence: controlled `value` → stored value → `defaultValue` →
  first option.

## Edge Cases

| Case                                          | Behaviour                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Composite `Button` vs primitive button        | Both in `@pops/ui`. Barrel exports the composite as `Button`; the primitive is `ButtonPrimitive`.         |
| Component without a story                     | Lands in `@pops/ui` anyway. Missing story is tracked tech debt, not a merge blocker.                      |
| Naming collision (Button/DropdownMenu/Select) | Primitive re-exported under an alias; raw primitive reachable via `@pops/ui/primitives/<name>`.           |
| Component needs a new design token            | Add the token to `@theme` in the design-tokens `globals.css`; never reach for an arbitrary value.         |
| Domain component needed by a 2nd app          | Extract a generic version into `@pops/ui`; the pillar may keep a thin domain wrapper.                     |
| `@pops/ui` tempted to import a pillar         | Forbidden — breaks the federation isolation guard and creates a project-reference cycle. Invert the edge. |

## Verification

- `pnpm typecheck` passes (`tsc --noEmit` for `libs/ui`).
- `pnpm lint` passes (`oxlint src && oxfmt --check .`).
- `vitest run` passes (includes `touch-targets.test.ts` and component tests).
- `check-storybook-coverage.mjs` passes — every frontend `@pops/app-*` surface
  is aliased in `libs/ui/.storybook/main.ts` so its stories resolve.
- Storybook renders component stories in light and dark mode.

## Acceptance Criteria

### Package scaffold

- [x] `libs/ui/package.json` is `@pops/ui` with correct `exports` and React 19 peer deps
- [x] `libs/ui/tsconfig.json` extends the shared base with strict mode
- [x] `libs/ui/src/index.ts` is the barrel public API
- [x] `libs/ui/src/lib/utils.ts` exports `cn()`
- [x] Workspace resolves the package; consumers `import { cn } from '@pops/ui'`
- [x] No build step — Vite resolves source

### Primitives

- [x] All Shadcn/Radix primitives exist in `libs/ui/src/primitives/` (Accordion … Tooltip)
- [x] Primitives exported from the barrel (collisions aliased)
- [x] Primitives use design tokens — no hardcoded colours / arbitrary values
- [x] Light and dark mode work for all primitives
- [~] Stories co-located **where applicable** — several primitives consumed only inside composites (checkbox, input, label, popover, radio-group, select, command, collapsible) ship without stories by design

### Composite form inputs

- [x] `TextInput`, `NumberInput`, `DateTimeInput`, `CheckboxInput`, `RadioInput`, `ChipInput`, `Autocomplete`, `ComboboxSelect` exist and are exported
- [x] Co-located stories for the form inputs
- [x] Use design tokens; meet 44×44px touch target; work in light/dark mode
- [x] Stack vertically on mobile viewports

### Data display composites

- [x] `DataTable` (sortable, paginated, row selection, horizontal scroll on mobile)
- [x] `DataTableFilters`, `InfiniteScrollTable`, `EditableCell`, `StatCard`
- [x] `ViewToggleGroup` — segmented, generic, persists to `localStorage`, rendered above its content
- [x] Co-located stories for `DataTableFilters`, `EditableCell`, `StatCard`
- [x] `DataTable` scrolls horizontally below 768px

### Utility composites

- [x] Composite `Button` wrapper (icon support, variants, touch-target expansion)
- [x] `Chip`, `DropdownMenu` wrapper, `Select` wrapper
- [x] `ErrorBoundary` — catches render errors, fallback UI, logs the error, `reset()`
- [x] Exported from the barrel; use design tokens

### Icon standards

- [x] `Plus` / `Pencil` / `Trash2` / `X` are the canonical add/edit/delete/close icons
- [x] Icon-only buttons carry `aria-label`
- [x] Destructive actions use `variant="ghost"` + `text-destructive`
- [x] Navigation icons sourced from `pillars/shell/src/app/nav/icon-map.ts`
- [ ] No banned icon names anywhere (`PenLine` still imported in `pillars/inventory/app/src/pages/item-form-page/sections/NotesSection.tsx`)
- [ ] Compact-vs-prominent button-pattern audit complete across all app packages
- [ ] Icon vocabulary enforced by lint rather than convention

> Unmet criteria (the icon-standards sweep + automated enforcement) are captured
> in [docs/ideas/components.md](../../../ideas/components.md).
