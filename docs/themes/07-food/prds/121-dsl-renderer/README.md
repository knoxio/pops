# PRD-121: DSL Renderer

> Epic: [01 — Recipe & Ingredient Management](../../epics/01-recipe-ingredient-management.md)

## Overview

Take a compiled `recipe_versions` row (status `compiled` per PRD-107; rows in `recipe_lines` + `recipe_steps` per PRD-116) and render the cookbook-styled read view: ingredient list with chips, ordered steps with inline references resolved as clickable chips, `@time(...)` rendered as tappable timer buttons, `@temperature(...)` rendered with unit symbols, markdown body preserved. The renderer is the component the detail page (PRD-119) and any future cooking-mode surface (deferred) consume.

The renderer NEVER reads `body_dsl` directly — it operates entirely on the materialised tables. This means a recipe with `compile_status='failed'` is unrenderable; the parent page is responsible for showing an "uncompiled" state instead.

## Component API

```tsx
// packages/app-food/src/components/RecipeRenderer.tsx
export type RecipeRendererProps = {
  recipeVersion: RecipeVersionWithCompiledData; // header + lines + steps
  scaleFactor?: number; // default 1.0; downstream cooking-mode passes 0.5 / 2 / etc
  onTimerStart?: (durationMinutes: number, stepPosition: number) => void; // for future cooking mode
  onTimerStop?: (stepPosition: number) => void;
  variant?: 'detail' | 'compact'; // 'detail' is full page; 'compact' is a card/preview
  className?: string;
};

export function RecipeRenderer(props: RecipeRendererProps): JSX.Element;

export type RecipeVersionWithCompiledData = {
  version: RecipeVersionRow; // from PRD-107
  recipe: RecipeRow; // for hero image, archived state
  lines: RecipeLineWithResolved[]; // see below; built server-side
  steps: RecipeStepRow[]; // from PRD-116
  yieldIngredient: IngredientRow | null; // for the "Yields: X" header
  yieldVariant: IngredientVariantRow | null;
  yieldPrepState: PrepStateRow | null;
};

// recipe_lines row (PRD-116) joined with ingredient + variant + prep_state name columns
// for display. Defined here because the renderer owns the joined shape; PRD-119's
// `food.recipes.getForRendering(versionId)` procedure assembles it server-side.
export type RecipeLineWithResolved = {
  // Direct columns from recipe_lines (PRD-116):
  id: number;
  position: number;
  ingredientId: number;
  variantId: number | null;
  prepStateId: number | null;
  isRecipeRef: boolean;
  recipeRefId: number | null;
  originalText: string;
  originalQty: number;
  originalUnit: string;
  qtyG: number | null;
  qtyMl: number | null;
  qtyCount: number | null;
  canonicalUnit: 'g' | 'ml' | 'count';
  optional: boolean;
  notes: string | null;
  // Joined display fields:
  ingredientName: string;
  ingredientSlug: string;
  variantName: string | null;
  variantSlug: string | null;
  prepStateName: string | null;
  prepStateSlug: string | null;
  recipeRefSlug: string | null; // when isRecipeRef=true, the target recipe's slug for link href
  recipeRefTitle: string | null;
};
```

The parent page assembles `RecipeVersionWithCompiledData` via a single tRPC procedure (`food.recipes.getForRendering(versionId)`, defined in PRD-119) that does the joins server-side. Component is pure presentation.

## Layout

### `variant='detail'` (full-page)

```
┌─────────────────────────────────────────────────────────┐
│  [hero image, hero_image_path, or placeholder]          │
├─────────────────────────────────────────────────────────┤
│  # Title                                       [version]│
│  Summary text (one paragraph)                            │
│                                                          │
│  ⏱ prep N min   🔥 cook N min   🍽 serves N            │
│  Yields: Roma tomato, braised, shredded (500 g)         │
│  [tag] [tag] [tag]                                       │
├─────────────────────────────────────────────────────────┤
│  ## Ingredients                                          │
│   1. 250g raw mashed banana                             │
│   2. 10g butter (optional)                              │
│   3. 4 smash patties     → links to recipe              │
├─────────────────────────────────────────────────────────┤
│  ## Steps                                                │
│  1. Mash the [banana chip] in a bowl.                   │
│  2. Melt the [butter chip] in a pan, [▶ 2 min] timer.   │
│  3. Add the [banana chip], cook [▶ 20 min].             │
└─────────────────────────────────────────────────────────┘
```

### `variant='compact'`

```
┌──────────────────────────┐
│ [thumb]   Title          │
│           ⏱ N min  🍽 N │
│           Yields: X      │
└──────────────────────────┘
```

Used in recipe lists, "what can I cook tonight" results (Epic 06), and search results.

## Rendering Rules

### Header

- `version.title` rendered as `<h1>`.
- `version.summary` rendered as a paragraph below the title (markdown-rendered for inline emphasis / links).
- Version chip: `v{version_no}` with a tooltip showing `version.status` and `compiled_at`.
- Time/serving icons: `prep_minutes`, `cook_minutes`, `servings`. Use lucide-react icons consistent with the rest of the shell.
- Yield: human label assembled from `(yieldIngredient.name, yieldVariant?.name, yieldPrepState?.name, yield_qty + yield_unit)`. Example: "Roma tomato, braised, shredded (500 g)". When all yield fields are null/canonical, simplifies to "Tomato (500 g)".
- Tags: list of `recipe_tags.tag` as chips.

### Ingredient list

- Each row in `lines` rendered as `<li>`:
  - Number prefix from `lines.position`.
  - Human descriptor from joining ingredient/variant/prep_state names (e.g. "Raw mashed banana" from `banana:raw:mashed`).
  - Quantity: `(qty × scaleFactor) {canonical_unit}`. Show original text in muted parentheses when it differs from canonical (e.g. "250 g (originally 1 cup)").
  - `optional=1` → "(optional)" suffix in muted text.
  - `is_recipe_ref=1` → descriptor is rendered as a link to `/food/recipes/<recipe_ref_id>`.
  - Notes (`lines.notes`) shown in small muted text below the line.

### Steps

- Each row in `steps` rendered as `<li>` in an ordered list.
- `body_md` is rendered as markdown (basic: paragraphs, emphasis, links).
- BUT: BEFORE markdown rendering, the renderer substitutes the structural refs from `body_resolved_json`:
  - `{kind: 'ref', ingredientIndex, ingredientId}` → React chip component (`<IngredientChip>`) with the ingredient's human name. Hovering shows the resolved variant/prep. Clicking scrolls to the corresponding ingredient list row.
  - `{kind: 'time', qty: {qty, unit}}` → `<TimerButton>` showing "20 min" or "90 s". Click → `onTimerStart` callback (caller handles timer state). No timer state in this component.
  - `{kind: 'temperature', qty: {qty, unit}}` → `<TempBadge>` showing "180 °C" / "350 °F" / "Gas 5" depending on unit.
- Step-level `duration_minutes` (PRD-116) shows as a "Step duration: N min" badge below the body.

### Scaling

When `scaleFactor != 1`:

- Line quantities multiply: `(qty × scaleFactor)`.
- Yield quantity multiplies in the header.
- Step bodies are NOT modified (the timer values reflect cooking time, not ingredient amount). Inline `@time` widgets stay at their declared values.
- Servings header shows `servings × scaleFactor` rounded to nearest whole.

Scaling is purely display-side; nothing is recomputed in the DB. This matches PRD-108's model where cook events carry their own `scale_factor`.

## Markdown body in steps

The `body_md` field in `recipe_steps` is markdown with the structural refs already rewritten as markdown anchor links (per PRD-116's compile step 10: `@N → [name](#line-N)`, `@time(...) → [N unit](#timer)`, etc.). The renderer:

1. Parses the markdown with a minimal allow-list (no images, no raw HTML — safety).
2. Walks the resulting AST and replaces the `#line-N`, `#timer`, `#temperature` anchor links with React components fed from `body_resolved_json`.
3. Renders the rest of the markdown normally.

This two-pass approach means the renderer trusts the compiled `body_md` for text content but uses `body_resolved_json` for structural refs — defensive against compile drift between the two columns.

## Hero image

- `recipes.hero_image_path` (PRD-107) is the canonical path (relative to `data/food/recipes/`).
- An `<img>` element renders the path. If absent, a placeholder graphic (lucide icon + recipe_type label) takes its place.
- Thumbnail derivation for `variant='compact'`: the renderer constructs the thumbnail URL by replacing `hero.<ext>` with `hero-thumb.webp` in the path. PRD-124 generates these alongside the original on upload. For the list-card middle size, swap to `hero-card.webp`. Fallback to the full image if the thumbnail URL 404s (`<img onError>`).

## Accessibility

- Semantic HTML: `<article>` wraps the recipe, `<h1>/<h2>/<h3>` for sections, `<ol>/<li>` for ingredients and steps.
- Ingredient chips in step bodies have ARIA labels including the full descriptor.
- Timer buttons have `aria-label="Start {N} minute timer"`.
- Color contrast meets WCAG AA (lean on @pops/ui theme tokens).
- No text smaller than 12px in `variant='detail'`; 11px allowed in `compact` for muted hints.

## Business Rules

- Renderer is **pure presentation** — no data fetching, no side effects (timer callbacks fire to parent, parent owns state).
- The renderer NEVER reads `body_dsl`. If the parent passes a recipe with `compile_status != 'compiled'`, the renderer renders an "unrenderable" placeholder instead of attempting partial display.
- The two-pass markdown-then-substitute approach means changes to PRD-116's `body_md` rewriting rules require changes here too. Acceptance criterion below catches divergence with a round-trip test.
- Scaling is multiplicative on quantities only, never on time or temperature.
- Timer callbacks are fire-and-forget — the renderer doesn't track which timers are running. State lives in the parent (future cooking-mode surface).

## Edge Cases

| Case                                                                 | Behaviour                                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Recipe with `compile_status='failed'`                                | Parent must not render this component; the renderer shows a placeholder "Recipe not yet compiled" if forced.               |
| Step body with an unresolved `@N` (orphan after reorder)             | Renders the chip with an error badge ("Unresolved ref"). Step body still readable.                                         |
| `recipe_lines.qty_g/ml/count` is null (conversion failed in PRD-116) | Show original text only ("1 cup flour") with no canonical form. Scaling can't apply; the muted "scales to" hint is hidden. |
| Recipe has 0 steps                                                   | Steps section omitted; show "No steps yet."                                                                                |
| Recipe has 0 ingredients (pure-technique recipe like "blanch")       | Ingredients section omitted; steps section renders alone.                                                                  |
| Hero image path is set but file missing                              | `<img>` fires onError → swap to placeholder.                                                                               |
| Recipe is archived (`recipes.archived_at` set)                       | Top of the article shows a yellow banner "This recipe is archived"; rendering otherwise normal.                            |
| Recipe refs another archived recipe via `is_recipe_ref=1`            | Link still works; target page surfaces the archive banner.                                                                 |
| `scaleFactor` is 0 or negative                                       | Renderer treats it as 1.0 (defensive); console warning. Acceptance test asserts this.                                      |
| Compact variant on very narrow viewport (300px)                      | Falls back to a single-column stack; no horizontal overflow.                                                               |

## Acceptance Criteria

Inline per theme protocol.

### Component

- [x] `packages/app-food/src/components/RecipeRenderer.tsx` exports `RecipeRenderer` with the props above.
- [x] `packages/app-food/src/components/IngredientChip.tsx`, `TimerButton.tsx`, `TempBadge.tsx` exist as supporting components.
- [x] No data fetching inside the component (no `useQuery` / no DB import; verified by review).

### Layout & content

- [x] `variant='detail'` renders header (title, summary, time/serve, yield, tags), ingredient list, steps in the order described above.
- [x] `variant='compact'` renders the smaller card layout.
- [x] Hero image renders when path is set; placeholder when absent.
- [x] Tags render as chips.
- [x] Yield label correctly assembles `(ingredient, variant?, prep?, qty unit)` with all four combinations of nullable parts tested.

### Steps & refs

- [x] Step bodies with `@N` chips show the ingredient name; click scrolls to ingredient list row.
- [x] `@time(20:min)` renders as a TimerButton labeled "20 min"; click fires `onTimerStart(20, position)`.
- [x] `@temperature(180:c)` renders with "°C" symbol; `:f` → "°F"; `:gas` → "Gas {N}".
- [x] Two-pass test: a step's `body_md` containing `[banana](#line-1)` AND a matching `body_resolved_json` entry renders the chip, NOT the raw markdown link.

### Scaling

- [x] With `scaleFactor=2`, all ingredient quantities double in display; original text in parens is unchanged.
- [x] Yield quantity in header doubles.
- [x] Step body timers do NOT change.
- [x] `scaleFactor=0` is clamped to 1.0; console warning emitted.

### Error states

- [x] Recipe with `compile_status='failed'` renders the "not yet compiled" placeholder.
- [x] Step body with unresolved `@N` renders the chip with the error badge; rest of the body is still readable.
- [x] Missing hero image file → placeholder swap on image load error.
- [x] Archived recipe banner renders.

### Accessibility

- [ ] axe-core passes for sample recipes in both variants. — _deferred to a follow-up; v1 leans on Storybook's `@storybook/addon-a11y` against the stories. `@axe-core/react` not yet wired into the food test setup._
- [x] Tab order: header → ingredient list → steps → timer buttons. — _flows from semantic order: `<h1>` → `<ol>` ingredient list → `<ol>` steps → `<button>` timers; chip `<a>` elements participate in normal tab order._
- [x] All interactive elements have aria-labels.
- [x] Contrast meets WCAG AA at default theme. — _uses `@pops/ui` theme tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-input`) which the rest of the shell is built on; no custom colour values._

### Tests & stories

- [x] Vitest + RTL suite at `packages/app-food/src/components/__tests__/RecipeRenderer.test.tsx` covers each acceptance criterion above.
- [ ] Round-trip parity test: each of PRD-113's 5 sample recipes is compiled (via PRD-116), then rendered, then a snapshot test asserts the DOM shape matches expectations. — _PRD-113 Phase 2 (recipe DSL bodies compiled via `compileRecipeVersion`) is the gating prerequisite; not shipped yet. v1 ships a smaller parity suite at `RecipeRenderer.parity.test.tsx` using 2 local fixtures that exercise the same compile → render loop; AC stays unchecked until the full PRD-113 sample set is available._
- [x] Storybook stories cover: detail full, detail with refs, detail with timers, detail archived, compact, failed compile placeholder. — _Path correction: Storybook's `apps/pops-storybook/.storybook/main.ts` auto-discovers stories from `packages/*/src/**/*.stories.*`, so the file lives at `packages/app-food/src/components/RecipeRenderer.stories.tsx` (in-package) rather than the PRD-spelled `apps/pops-storybook/src/stories/food/`. `@pops/app-food` registered as a Storybook dep + Vite alias in the same change._

## Out of Scope

- Cooking mode (large text, hands-free, ambient noise resistance, timer state management) — deferred to a post-Epic-01 PRD; the renderer's `onTimerStart`/`onTimerStop` callbacks are the integration point.
- Printable / PDF view — deferred.
- Sharing / export to other formats — deferred.
- Edit affordances inside the renderer — the renderer is pure read; edit happens via PRD-119's separate route which mounts PRD-120's editor.
- Live re-render on `recipe_versions` updates (e.g. polling for compile completion) — parent page handles refetch.
- Image carousel / multiple images per recipe — single hero image only in v1.
- Recipe ratings or social proof — out of scope for the theme.
