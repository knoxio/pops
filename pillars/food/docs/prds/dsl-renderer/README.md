# DSL Renderer

> Epic: [01 — Recipe & Ingredient Management](../../epics/01-recipe-ingredient-management.md)

Status: **Done** — `onTimerStop` callback, a cooking-mode surface, the renderer-owned "card" middle size, an automated axe-core sweep, and the full parser-corpus parity suite are not built and live in [`docs/ideas/recipe-renderer-extensions.md`](../../ideas/recipe-renderer-extensions.md).

Cookbook read view of a compiled recipe version. Takes the fully joined render payload and produces the styled detail page: hero image, header (title / version chip / summary / prep-cook-serves facts / yield / tags), ingredient list with scaling, and ordered steps whose inline `@ref` / `@time` / `@temperature` markers are resolved into clickable ingredient chips, tappable timer buttons, and temperature badges. Pure presentation — no fetching, no timer state, no DB access. The component lives at `pillars/food/app/src/components/RecipeRenderer.tsx` and is consumed today by the inbox inspector (`pages/inbox/inspector/InspectorRenderer.tsx`).

The renderer never reads `body_dsl`; it operates entirely on the materialised columns assembled server-side. A version whose `compileStatus !== 'compiled'` is unrenderable — the renderer shows a "not yet compiled" placeholder rather than attempting partial display.

## Data source

The full payload is fetched by the parent (not the component) from the food REST contract:

- `GET /recipes/:slug?versionNo=N` (`recipes.getForRendering`) → `RecipeVersionWithCompiledData` (200), `ERR_RESPONSES` (404 unknown slug, etc).

The component's view types are projected directly from the generated SDK response (`RecipesGetForRenderingResponses[200]`) so the renderer stays in lockstep with the wire shape. `RecipeVersionWithCompiledData` carries: `version` (recipe_versions header), `recipe` (hero path + `archivedAt`), `lines[]` (recipe_lines joined with ingredient / variant / prep_state display names + recipe-ref slug/title), `steps[]` (recipe_steps with `bodyMd`, `bodyResolvedJson`, hoisted `durationMinutes` / `temperatureValue` / `temperatureUnit`), `tags[]`, and the yield triple (`yieldIngredient` / `yieldVariant` / `yieldPrepState`).

Each step's `bodyResolvedJson` is parsed FE-side into `ResolvedStepBody` — an ordered array of `{kind:'text'}` / `{kind:'ref', ingredientIndex, ingredientId, variantId, prepStateId}` / `{kind:'time', qty}` / `{kind:'temperature', qty}` parts. A defensive `JSON.parse` failure yields an empty body so markdown still renders.

## Component API

```ts
RecipeRendererProps = {
  recipeVersion: RecipeVersionWithCompiledData; // full joined payload
  scaleFactor?: number;                         // display-only multiplier, default 1.0
  onTimerStart?: (durationMinutes: number, stepPosition: number) => void; // fire-and-forget
  variant?: 'detail' | 'compact';               // default 'detail'
  className?: string;
};
```

Supporting components: `IngredientChip` (in-page `<a>` to `#line-N`), `TimerButton` (`<button>` firing `onTimerStart`), `TempBadge` (`°C` / `°F` / `Gas N`). All copy goes through `useTranslation('food')` against the `renderer.*` keys in `libs/locales/en-AU/food.json`.

## Rendering rules

**Header (`variant='detail'`).** `<h1>` title + secondary `Badge` version chip (`v{versionNo}`, tooltip carries `status` + `compiledAt`). Summary paragraph when present. Facts row renders prep / cook / serves with lucide icons, each only when its column is set. Yield label assembles `ingredient.name` + optional `, variant` + `, prep` + `(qty unit)` — all four nullable combinations handled, falling back to the ingredient name alone. Tags render as outline `Badge` chips in a labelled `<ul>`.

**Ingredient list.** Each line is an `<li>` with `id="line-{position}"` (the scroll target for step chips) and a `position.` prefix. Descriptor is built `"<prep> <variant> <ingredient>"`, first letter capitalised. Quantity shows `formatQty(canonicalQty × scaleFactor) {canonicalUnit}`; when the canonical and original units differ, the original text is shown as a muted aside (unscaled). `optional` → muted `(optional)` suffix. `isRecipeRef` + `recipeRefSlug` → descriptor becomes a link to `/food/recipes/{slug}` (title or descriptor as text). `notes` render as a muted italic block below the line.

**Steps.** Steps sorted by `position`, each an `<li>`. The body is rendered two-pass: `bodyMd` is markdown (`react-markdown` + `rehypeSanitize`, images stripped) whose structural refs are anchor links (`[name](#line-N)`, `[N min](#timer)`, `[180](#temperature)`). While walking the rendered anchors in document order, each is matched against the next structural part from `ResolvedStepBody` and swapped for the corresponding React component — `IngredientChip`, `TimerButton`, or `TempBadge`. The cursor only advances on a kind match; on disagreement the anchor degrades to a plain link and the cursor holds so later anchors stay aligned (no cascade desync). Step-level `durationMinutes` and `temperature*` columns render as separate badges below the body, distinct from inline widgets.

**Timer normalisation.** `TimerButton` displays the literal DSL qty + unit (`2 min`, `90 s`) but the callback receives minutes: `h`/`hr`/`hour` × 60, `s`/`sec` ÷ 60 (rounded), everything else passthrough.

**Temperature.** `:c` → `180 °C`, `:f` → `350 °F`, `:gas` → `Gas 5`; aria-label spells the unit name out.

**Scaling.** Display-only and multiplicative on quantities only. Line canonical quantities and the header yield quantity multiply by `scaleFactor`; servings show `round(servings × scaleFactor)`. Original-text asides, prep/cook times, and inline `@time` / `@temperature` widgets are never scaled. Nothing is recomputed in the DB. `scaleFactor === undefined` → 1.0; zero / negative / `NaN` → clamped to 1.0 with a one-shot console warning per unique invalid value.

**Hero image.** `recipe.heroImagePath` renders as `<img src="/api/food/recipes/{path}">`; `null` path or load error swaps to a `Utensils` placeholder. The compact thumb derives `hero-thumb.webp` from the path (`hero.<ext>` → `hero-thumb.webp`) with the same placeholder fallback.

**Compact (`variant='compact'`).** Single bordered row: derived thumb + title + a quick-facts line (`prep+cook` total minutes, scaled servings) + truncated yield label.

## Business rules

- Pure presentation: no `useQuery`, no DB import, no side effects inside the component. Timer callbacks fire to the parent; the parent owns all timer state.
- The renderer never reads `body_dsl`. Any non-`compiled` status renders the placeholder, not partial output.
- Two-pass body render trusts `bodyMd` for text and `bodyResolvedJson` for structure — defensive against compile drift between the two columns.
- Scaling is multiplicative on quantities only, never on time or temperature.

## Edge cases

| Case                                            | Behaviour                                                                   |
| ----------------------------------------------- | --------------------------------------------------------------------------- |
| `compileStatus !== 'compiled'`                  | "Recipe not yet compiled" placeholder (`EmptyState`).                       |
| Step anchor with no matching line (orphan `@N`) | Chip renders with a destructive error badge; body stays readable.           |
| Anchor kind disagrees with next resolved part   | Anchor degrades to a plain link; cursor holds (no following-anchor desync). |
| Line with all canonical qty columns null        | Original text only; no scaled form, no muted aside.                         |
| 0 steps                                         | Steps section shows "No steps yet."                                         |
| 0 ingredients (technique recipe)                | Ingredients section omitted; steps render alone.                            |
| Hero path set but file 404s                     | `<img onError>` swaps to placeholder.                                       |
| `recipe.archivedAt` set                         | Warning banner at top of the article; rendering otherwise normal.           |
| `scaleFactor` 0 / negative / `NaN`              | Clamped to 1.0 with a single console warning per offender.                  |

## Accessibility

- `<article>` wraps the recipe; `<h1>`/`<h2>`/`<ol>`/`<li>` give semantic order (header → ingredients → steps → timers), so tab order flows without `tabIndex` overrides; chips are real `<a>` and timers real `<button>`.
- Ingredient chips, timer buttons, and temp badges carry aria-labels (chip includes the ingredient name; timer includes the duration; temp spells the unit).
- Colour comes only from `@pops/ui` theme tokens (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-input`, `border-warning`) — no custom values — so contrast tracks the shell's WCAG-AA baseline.

## Acceptance criteria

Covered by `app/src/components/__tests__/RecipeRenderer.test.tsx`, `RecipeRenderer.parity.test.tsx`, and `RecipeRenderer.stories.tsx`.

- [x] `RecipeRenderer` and supporting `IngredientChip` / `TimerButton` / `TempBadge` are exported; no data fetching or DB import inside the component (verified by structure).
- [x] `variant='detail'` renders header, ingredient list, and steps in order; `variant='compact'` renders the smaller card.
- [x] Header: title, version chip, summary, prep/cook/serves (each only when set), yield label across all four nullable ingredient/variant/prep/qty combinations, tag chips.
- [x] Ingredient lines: canonical qty + unit, muted original-text aside when units differ, `(optional)` suffix, recipe-ref link, notes block; rows carry `#line-N` anchors.
- [x] Step bodies resolve `#line-N` → ingredient chip (links to the matching row), `#timer` → `TimerButton`, `#temperature` → `TempBadge`; two-pass picks the resolved part over the raw markdown link.
- [x] `TimerButton` shows the literal DSL qty/unit and fires `onTimerStart` with normalised minutes (seconds and hours converted); inline timer values do not scale.
- [x] `TempBadge` renders `°C` / `°F` / `Gas N`; step-level duration + temperature badges render from the hoisted columns.
- [x] Scaling: line quantities and header yield/servings scale by `scaleFactor`; original text, times, and inline widgets do not; `scaleFactor` 0/negative/NaN clamps to 1.0 with a one-shot warning.
- [x] Error states: non-`compiled` placeholder, orphan-ref error chip, anchor/part mismatch fallback without cursor desync, missing-hero placeholder swap on load error, archived banner.
- [x] Accessibility surface: `<article>` + heading levels; aria-labels on chips, timer buttons, temp badges.
- [x] Round-trip parity: a compiled fixture renders every `recipe_lines` row as an `<li>`, substitutes step anchors with chips/timers/temps, assembles the yield label, and renders header columns (2-fixture suite; full 5-sample set is an idea).
- [x] Storybook stories cover detail-full, detail-with-refs, detail-with-timers, detail-archived, compact, and uncompiled-placeholder.
