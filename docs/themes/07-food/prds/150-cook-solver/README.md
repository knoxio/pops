# PRD-150: What-Can-I-Cook Solver

> Epic: [06 — Substitutions & Solver](../../epics/06-substitutions.md)

## Overview

`/food/solve` — the discovery surface that walks every cookable recipe against the current fridge + the substitution graph and returns a ranked list of recipes the user can actually make right now. Binary cookable answer per recipe (true iff every required line is satisfied by FIFO OR a valid substitution). Ranked by `# subs needed ASC, last_cooked_at DESC`. Click "Cook this" jumps to `/food/recipes/:slug` — the regular cook flow takes over.

After this PRD, the user can answer "Tuesday 6pm, I'm tired, what's actually possible" by opening one page. The fridge view (`/food/fridge`) gains a "What can I cook?" button that opens the solver pre-loaded with the current fridge state.

No new tables. One new tRPC query (`food.solver.canICook`) and one new sidebar entry under Food.

## Route

| Path                               | Page        | Purpose                                                      |
| ---------------------------------- | ----------- | ------------------------------------------------------------ |
| `/food/solve`                      | `SolvePage` | Ranked list of cookable recipes given the current fridge     |
| `/food/solve?includeSubs=0`        | `SolvePage` | Same; restricts to recipes cookable WITHOUT any substitution |
| `/food/solve?recipeType=plate&...` | `SolvePage` | Same; filtered by recipe_type / tags / max-time / etc.       |

Sub-nav: PRD-118's manifest gains a third sub-entry under Food: "Solve" → `/food/solve` (after Recipes, Plan, Fridge).

The `/food/fridge` page header (PRD-147) gains a "What can I cook?" button that navigates to `/food/solve`.

## Page layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ What can I cook?                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  [ ☐ No substitutions ]  [ Type ▼ ]  [ Tags ▼ ]  [ Max time ▼ ]    │
│  43 of 127 recipes cookable                                         │
├─────────────────────────────────────────────────────────────────────┤
│  📗 Chicken Tikka Masala                                            │
│     No subs needed · 35 min · last cooked 2w ago                    │
│     [ Cook this → ]                                                  │
│                                                                       │
│  📗 Pasta Pomodoro                                                  │
│     No subs needed · 20 min · last cooked 4d ago                    │
│     [ Cook this → ]                                                  │
│                                                                       │
│  ⚠ Beef Stir Fry                                                    │
│     1 sub needed: soy sauce → tamari                                │
│     30 min · last cooked 1mo ago                                    │
│     [ Cook this → ]                                                  │
│                                                                       │
│  ⚠ Carbonara                                                        │
│     2 subs needed                                                    │
│     [ Show subs ▼ ]                                                  │
│     [ Cook this → ]                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Header filters

- **No substitutions** checkbox: restricts results to recipes with zero subs needed (the "clean" subset).
- **Type filter**: multi-select of `recipe_type` values (plate / component / sauce / etc.).
- **Tags filter**: multi-select from `recipe_tags`.
- **Max time**: dropdown (≤15 min / ≤30 min / ≤45 min / ≤60 min / no limit). Filters by `recipe_versions.prep_minutes + cook_minutes`.
- **Count caption**: `"<cookable> of <total> recipes cookable"` updates with filters.

### Recipe card

Each row renders:

- **Icon**: 📗 (clean — no subs) or ⚠ (one or more subs needed).
- **Title** (links to `/food/recipes/:slug` on click anywhere except the Cook this button).
- **Status line**: "<N subs needed>" + total time + "last cooked <relative>".
- **Substitutions** (when N > 0): inline "soy sauce → tamari" for the N=1 case, or a "Show subs ▼" expander for N>1 that lists each sub.
- **Cook this** button → `/food/recipes/:slug`.

### Empty state

- "No recipes are cookable right now. Try adding `Show with substitutions`, or check `/food/fridge` to see what's in stock."
- If all filters are cleared and 0 recipes cookable: "Pantry's bare. Add a batch to get started."

### Sort

- Default: `# subs needed ASC, last_cooked_at DESC NULLS LAST, recipe.slug ASC`.
- No user-facing sort dropdown in v1 (the default is the only useful order for this surface).

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extends; food module)
food.solver.canICook: query({
  input: {
    excludeSubs?: boolean,                          // true = only recipes cookable without any sub
    recipeTypes?: string[],                         // filter by recipes.recipe_type
    tags?: string[],                                // filter by recipe_tags (AND across tags)
    maxMinutes?: number,                            // filter by prep + cook ≤ maxMinutes
  },
  output: SolveResult,
});

export type SolveResult = {
  totalCandidates: number;                          // count of recipes considered (post-filter)
  cookableCount: number;                            // count where canCook = true
  recipes: SolveRecipeRow[];                        // ranked; cookable only (excludes uncookable)
};

export type SolveRecipeRow = {
  recipeId: number;
  recipeSlug: string;
  title: string;
  recipeType: string | null;
  heroImagePath: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  lastCookedAt: string | null;
  subsNeeded: number;                               // count of LINES covered by a substitution (not distinct edges; a single edge resolving two lines counts as 2). 0 = clean.
  subs: SolveSubBreakdown[];                        // detailed list when subsNeeded > 0
};

export type SolveSubBreakdown = {
  lineIndex: number;                                // recipe_lines.position
  fromIngredientName: string;
  fromVariantName: string | null;
  candidateSubName: string;                         // the substitute that resolved this line
  substitutionId: number;                           // PRD-109's substitutions.id
};
```

### `canICook` server-side flow

For each non-archived recipe with `current_version_id IS NOT NULL` AND `compile_status='compiled'`:

1. Apply pre-filters (type / tags / max minutes). Skip recipes that don't match.
2. SELECT `recipe_lines` for the version. For each line (excluding `optional=true`):
   - SELECT `batches` matching `(variant_id, prep_state_id, qty_remaining > 0, deleted_at IS NULL)`; sum qty.
   - If sum × `unit-match` ≥ `line.qty_g | qty_ml | qty_count` (in canonical unit): line is covered by FIFO. Mark `covered`.
   - Else: walk substitutions via PRD-149's `resolveForLine` shape (server-side reuse — extract the substitution-resolution query). For each candidate sub edge, check if any of its batches can cover the line at the edge's ratio. First candidate that covers wins; mark `covered-by-sub` and record the edge.
   - If neither FIFO nor any sub covers the line: line is `uncovered`. The recipe is NOT cookable; short-circuit and move to the next recipe.
3. If every line is `covered` or `covered-by-sub`: recipe is cookable. `subsNeeded = count(covered-by-sub)`. Collect `SolveSubBreakdown` entries.
4. Build the result list. Sort by `subsNeeded ASC, lastCookedAt DESC NULLS LAST, slug ASC`.
5. Return `SolveResult` with the count and the ranked rows.

**Performance**: For 500 recipes × 12 lines × ~5 candidate subs per line, this is ~30k row reads. SQLite handles in <200ms with the existing indexes (`idx_recipe_lines_version`, `idx_batches_variant_prep`, `idx_subs_from_*`). The AC test target is <200ms for a 500-recipe seeded fixture. Profile with a seeded fixture; cache deferred to v2.

### Shared substitution-query service

**Canonical ownership: PRD-150.** The service lives at `apps/pops-api/src/modules/food/services/substitutions-resolve.ts` and is created during PRD-150's implementation. PRD-149's `food.substitutions.resolveForLine` tRPC procedure imports and wraps it. The contract is: `(recipeVersionId, lineIndex) → { line + candidates + batches }`.

This consolidates the substitution-resolution logic (PRD-109's precedence + context-tag rules) into one place. PRD-149 retains the public tRPC endpoint; PRD-150's solver calls the service directly per-line during `canICook`.

**PRD-109 amendments carried in this service** (PRD-149 introduced them; PRD-150 inherits):

- Recipe-scoped override semantics refined to `(from_*, to_*)` pair rather than `from`-only. A recipe-scoped sub for `(butter, coconut-oil)` shadows only the global `(butter, coconut-oil)` edge — other global edges from `butter` (e.g. `butter → olive-oil`) still apply.
- Context-tag matching uses an OR-overlap with the recipe's `recipe_tags` as the `:C` parameter. Wildcard subs (`context_tags = '[]'`) match any context.

## Sidebar integration

PRD-118's `app-food` manifest gains a new sub-nav entry: "Solve" → `/food/solve`. Positioned after Fridge (PRD-147) in the food sub-nav; exact integer chosen at implementation time to avoid colliding with other modules' renumbering, matching the convention established by PRD-118.

`/food/fridge`'s header gets a "What can I cook?" button (top-right area near Add batch) that navigates to `/food/solve`. PRD-147 amendment.

## Components

```
packages/app-food/src/pages/solve/
├── SolvePage.tsx
├── SolveFilters.tsx                              // header chip group
├── SolveRecipeCard.tsx
├── SubBreakdownExpander.tsx                      // for cards with multiple subs
└── useSolveResult.ts                              // wraps food.solver.canICook
```

## Business Rules

- Candidate set is non-archived recipes with `current_version_id IS NOT NULL` AND `compile_status='compiled'`. Drafts excluded — they can't be cooked.
- Only `optional=false` lines are required. Optional lines never block cookability (matches PRD-108 + PRD-146).
- Substitution resolution is single-hop (PRD-109 rule). No transitive chains.
- A line is covered-by-sub iff at least one substitution edge has a candidate batch that, multiplied by the edge's `ratio`, covers the line's qty. The first qualifying edge wins (no preference between subs at this stage).
- The breakdown lists the chosen sub per covered-by-sub line; the user sees what subs were assumed.
- Sort: `subsNeeded ASC` is the primary signal. Recipes with zero subs needed always rank above any sub-requiring recipe.
- The solver does NOT pre-commit anything. Clicking "Cook this" navigates to `/food/recipes/:slug`; the regular cook flow (PRD-144 + PRD-149) takes over. The cook flow may pick different subs than what the solver assumed — that's fine; the solver answered "is this cookable", not "here's exactly how to cook it".
- Filters compose (AND across filter groups; OR within a group). Tags filter is AND (recipe must have all selected tags) — implemented via `GROUP BY recipe_id HAVING COUNT(DISTINCT tag) = :selectedTagCount` against the `recipe_tags` join.
- Max-time filter: a recipe passes iff `COALESCE(prep_minutes, 0) + COALESCE(cook_minutes, 0) <= maxMinutes` OR `prep_minutes IS NULL AND cook_minutes IS NULL`. A recipe with BOTH minutes null is treated as "unknown duration" and always shown; a recipe with one null and one non-null treats null as 0.
- Optional lines (`recipe_lines.optional = 1` per PRD-116) are filtered from the line set **before** any FIFO or substitution lookup runs. They never appear in `SolveSubBreakdown` and never block cookability.
- Polling: `food.solver.canICook` refetches every 60s while the page is visible (batches change as the user cooks). Polling pauses when `document.visibilityState !== 'visible'` (backgrounded tabs / minimised window).
- No caching server-side; cheap to recompute.

## Edge Cases

| Case                                                                                                       | Behaviour                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pantry is completely empty                                                                                 | All recipes return `canCook=false`. Empty state with "Pantry's bare" message.                                                                                                                    |
| All required lines have batches; no subs anywhere                                                          | Every cookable recipe has `subsNeeded=0`. Clean list.                                                                                                                                            |
| A recipe needs 200g flour; pantry has two batches totalling 250g                                           | FIFO covers it; `subsNeeded=0` for this line.                                                                                                                                                    |
| A recipe needs 200g flour; pantry has 100g flour + sub edge `flour → almond-meal` with 200g of almond-meal | Line is covered-by-sub via almond-meal. Recipe is cookable with `subsNeeded += 1`.                                                                                                               |
| A recipe needs an ingredient with no FIFO coverage AND no sub at all                                       | Recipe is uncookable. Excluded from the result.                                                                                                                                                  |
| Recipe has 20 lines, 1 uncoverable                                                                         | Uncookable. Excluded.                                                                                                                                                                            |
| Same sub edge would resolve two different lines                                                            | Each line independently picks; the edge is used twice in the breakdown. No deduplication.                                                                                                        |
| Filters narrow to 0 recipes                                                                                | Empty state with a "Clear filters" link.                                                                                                                                                         |
| Max-time filter excludes a recipe that's otherwise cookable                                                | Filtered before the cookability check; not surfaced.                                                                                                                                             |
| Recipe with prep+cook missing (`null` minutes)                                                             | Always passes the max-time filter (treated as "unknown"). UI shows "Time: ?".                                                                                                                    |
| User toggles `excludeSubs=true`                                                                            | Result list shrinks to only `subsNeeded=0` rows. Cookable count updates.                                                                                                                         |
| 500-recipe library                                                                                         | <200ms server-side per the perf notes. Acceptable.                                                                                                                                               |
| Recipe was just cooked; `last_cooked_at` is now                                                            | Sort places recent cooks at the TOP of their `subsNeeded` band (DESC NULLS LAST = most recent first; never-cooked recipes at bottom). See "Note on sort direction" below for the full rationale. |
| Tag filter `[]` (empty)                                                                                    | No tag filter applied.                                                                                                                                                                           |
| Recipe has multiple lines that each require subs                                                           | `subsNeeded` is the count of subs (one per line covered-by-sub). Breakdown lists each.                                                                                                           |
| Solver picks a sub whose batch is very small (just barely covers)                                          | OK at solver time. Cook flow may pick differently. Solver answered "cookable"; doesn't commit to the exact batch.                                                                                |
| Recipe with 0 ingredient lines (compiled but empty)                                                        | `subsNeeded=0`, `cookable=true`. Surfaces at the top of the result list (subsNeeded=0 band). Usually indicates an in-progress recipe; the solver surfaces it honestly.                           |

**Note on sort direction**: `last_cooked_at DESC NULLS LAST` means recipes never cooked appear LAST within their `subsNeeded` band, and recipes cooked most recently appear FIRST. This favours "familiar" recipes when subs needed are equal. If user feedback shows the opposite preference (surface forgotten recipes), this can flip to `ASC NULLS FIRST` in a follow-up.

## Acceptance Criteria

Inline per theme protocol.

### Routes & shell

- [ ] `/food/solve` registered in PRD-118's `app-food` manifest with sidebar entry "Solve".
- [ ] Sidebar order places Solve after Fridge.
- [ ] `/food/fridge` header (PRD-147 amendment) gains a "What can I cook?" button linking to `/food/solve`.

### Page

- [ ] Header filters: No-subs toggle, Type, Tags, Max time.
- [ ] Counter caption shows "<cookable> of <total> recipes cookable" with the right numbers.
- [ ] Recipe card renders icon (📗 / ⚠), title, status line, sub list / expander, Cook this button.
- [ ] "Cook this" navigates to `/food/recipes/:slug`.
- [ ] Polling refetches every 60s while page visible; pauses when `document.visibilityState !== 'visible'`.

### Solver

- [ ] `food.solver.canICook` exists in `apps/pops-api/src/modules/food/router.ts`.
- [ ] Candidate set filters by archived + current_version_id + compile_status.
- [ ] Each line evaluated: FIFO first; subs second; single-hop only.
- [ ] Optional lines are filtered from the line set BEFORE FIFO / sub lookups run; they never appear in `SolveSubBreakdown`; verified by an integration test that uses an optional ingredient with zero stock.
- [ ] `subs` array reports the chosen sub per covered-by-sub line.
- [ ] Result sorted by `subsNeeded ASC, lastCookedAt DESC NULLS LAST, slug ASC`.

### Filter behaviour

- [ ] No-subs toggle removes rows with `subsNeeded > 0`.
- [ ] Type filter narrows candidates pre-cookability check.
- [ ] Tags filter is AND (all selected tags must appear).
- [ ] Max-time filter applied to `prep_minutes + cook_minutes`; null minutes always pass.

### Shared service

- [ ] Substitution-resolution query lives at `apps/pops-api/src/modules/food/services/substitutions-resolve.ts` and is consumed by both `food.substitutions.resolveForLine` (PRD-149) and `food.solver.canICook` (this PRD).

### Tests

- [ ] Vitest + RTL at `packages/app-food/src/pages/solve/__tests__/SolvePage.test.tsx` covers render + filter + sort + Cook this navigation.
- [ ] Vitest integration at `apps/pops-api/src/modules/food/__tests__/solver.test.ts`:
  - All lines covered by FIFO → `subsNeeded=0`, cookable.
  - One line uncoverable → recipe excluded.
  - One line covered-by-sub → `subsNeeded=1`, cookable, breakdown lists the sub.
  - Optional line uncovered → still cookable.
  - Sort: subsNeeded ASC primary, lastCookedAt DESC secondary, slug ASC tertiary.
  - Filter combinations work.
  - Performance: 500-recipe seeded fixture returns in <200ms (with 50ms headroom).

### Mobile

- [ ] Page readable at 375px.
- [ ] Cards stack single-column.
- [ ] Filter chips wrap to multiple lines.

## Out of Scope

- Multi-hop substitution chains — PRD-109 rule.
- Expiry-weighted scoring — user-rejected option.
- "Cook with these subs" one-click flow that pre-commits the solver's picks — out of scope; solver suggests, cook flow commits.
- Half-credit / partially-cookable tier — out of scope; binary canCook only.
- Solver across batches in specific locations only — out of scope; uses all non-deleted, non-empty batches.
- Solver suggestions ranked by user rating — out of scope.
- Solver suggestions filtered by dietary tags ("vegan tonight") — out of scope; future PRD if a tag schema for diet emerges.
- Embedding the solver in plan grid / recipe list / homepage — explicit no-go per Epic 06's Key Decisions.
- Sort dropdown (let user pick ranking) — out of scope; one canonical order.
- Caching the solver result — out of scope; recompute per query.
- Real-time push when fridge changes — out of scope; 60s polling.
- "Make me a meal plan from the pantry" — out of scope; planning is per-entry (PRD-143).

## Requires (cross-PRD dependencies)

- **PRD-107** — `recipes` / `recipe_versions` / `recipe_tags` schema; `current_version_id`, `compile_status`, `prep_minutes`, `cook_minutes`.
- **PRD-108** — `batches` / `recipe_runs` schema; `recipe_runs.completed_at` for `last_cooked_at` JOIN.
- **PRD-109** — `substitutions` schema; precedence + context rules.
- **PRD-116** — `recipe_lines.position` / `variant_id` / `prep_state_id` / `qty_g` / `qty_ml` / `qty_count` / `canonical_unit` / `optional`.
- **PRD-118** — `app-food` manifest; new sub-nav entry.
- **PRD-124** — `recipes.hero_image_path` for card thumbnails (read into `heroImagePath`).
- **PRD-145** — `batches.deleted_at` filter.
- **PRD-147** — Amendment: `/food/fridge` header gains a "What can I cook?" button.
- **PRD-149** — Shared substitution-resolution service (see "Shared substitution-query service" section).
