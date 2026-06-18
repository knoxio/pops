# PRD-113: Seed Data & Mise Tasks

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Wire up the food seed: a `mise db:seed:food` task that populates the food tables with a small but realistic fixture set. The seed must exercise every schema constraint from PRDs 106–112 and successfully drive the DSL compile pipeline (PRDs 114–117) end to end, so the seed run itself doubles as the cross-PRD smoke test. Last PRD in Epic 00 — finishing this means the schema epic is shippable.

The seed deliberately includes sample _recipes_ — not just ingredients — because the recipe compile path (parse → resolve → cycle check → materialise) only proves out when actually invoked against real data. A seed with zero recipes would leave PRDs 114–117 unexercised at fixture time.

## Fixture set

### Ingredients (~20)

Selected to cover the matrix of (default_unit, has_density, has_shelf_life, has_variants):

| Slug        | default_unit | Variants                                                      | Notes                                   |
| ----------- | ------------ | ------------------------------------------------------------- | --------------------------------------- |
| `salt`      | g            | `table`, `flaky`                                              | Shelf-stable; no expiry                 |
| `pepper`    | g            | `black-ground`, `white-ground`, `pink-whole`                  | Shelf-stable                            |
| `olive-oil` | ml           | `extra-virgin`, `light`                                       | Density ~0.91                           |
| `butter`    | g            | `unsalted`, `salted`, `cultured`                              | Fridge 30d, freezer 365d                |
| `onion`     | count        | `yellow`, `red`, `spring`                                     | Density n/a (count-default); fridge 14d |
| `garlic`    | count        | `whole-head`, `peeled-clove`                                  | Pantry 30d                              |
| `tomato`    | count        | `roma`, `cherry`, `beefsteak`, `canned-whole`, `canned-diced` | Density 0.65 for chopped; fridge 7d     |
| `egg`       | count        | `large`, `medium`, `small`                                    | Fridge 21d                              |
| `flour`     | g            | `plain`, `bread`, `self-raising`                              | Pantry 365d                             |
| `sugar`     | g            | `caster`, `brown`, `icing`                                    | Pantry indefinite                       |
| `milk`      | ml           | `full-cream`, `skim`, `oat`                                   | Fridge 7d                               |
| `cheese`    | g            | `colby-block`, `cheddar-shredded`, `parmesan-grated`          | Fridge 30d                              |
| `chicken`   | g            | `breast`, `thigh`, `whole`, `mince`                           | Fridge 2d, freezer 90d                  |
| `beef`      | g            | `chuck`, `mince`, `ribeye`                                    | Fridge 2d, freezer 180d                 |
| `potato`    | count        | `desiree`, `royal-blue`, `kipfler`                            | Pantry 30d                              |
| `carrot`    | count        | `standard`, `baby`                                            | Fridge 21d                              |
| `lemon`     | count        | (none — default variant)                                      | Fridge 14d                              |
| `corn`      | count        | `fresh-cob`, `canned-brine`, `frozen-kernels`                 | Fridge cob 5d, canned 365d              |
| `bread`     | count        | `sourdough-loaf`, `burger-bun`, `flatbread`                   | Fridge 7d, freezer 90d                  |
| `parsley`   | g            | `flat-leaf`, `curly`                                          | Fridge 7d                               |

Roughly 60 variants across these 20 ingredients.

**Shelf-life mapping.** Per PRD-108, `default_shelf_life_days_fridge` and `default_shelf_life_days_freezer` are columns on `ingredient_variants`, not `ingredients`. The "Notes" column above shows the typical per-ingredient values; the seed script applies them to **every variant** of that ingredient unless a variant-specific override is needed (e.g. for `corn` the per-variant overrides are explicit: `fresh-cob` = fridge 5d, `canned-brine` = fridge 365d / pantry indefinite, `frozen-kernels` = freezer 365d). For ingredients with no variant-specific differences (e.g. `butter` is the same shelf life across `unsalted`/`salted`/`cultured`), the seed writes the same fridge/freezer values to all variants. Pantry-storable items have null fridge/freezer shelf-life and are assumed indefinite for v1.

### Hierarchy

A small parent-child set to exercise PRD-106's hierarchy and depth cap:

- `tomato` → `roma-tomato` (parent: tomato)
- `tomato` → `cherry-tomato` (parent: tomato)
- `potato` → `desiree-potato` (parent: potato)

Depth is at most 2 in the seed; the depth-cap (3) is exercised by a Vitest case, not by the seed itself.

### `prep_states` (15)

The canonical list from PRD-106:

`whole`, `diced`, `sliced`, `chopped`, `shredded`, `minced`, `julienned`, `grated`, `crushed`, `zested`, `juiced`, `melted`, `softened`, `mashed`, `roughly-chopped`.

### `ingredient_aliases` (~30)

Common alternatives to exercise resolver lookups:

| Alias          | Target (kind, slug)                               |
| -------------- | ------------------------------------------------- |
| `scallion`     | ingredient/onion (variant `spring`)               |
| `spring onion` | variant onion:spring                              |
| `green onion`  | variant onion:spring                              |
| `capsicum`     | (not in seed — placeholder for testing "unknown") |
| `bell pepper`  | (also intentionally unknown)                      |
| `evoo`         | variant olive-oil:extra-virgin                    |
| `evo`          | variant olive-oil:extra-virgin                    |
| `passata`      | variant tomato:canned-whole                       |
| `eggs`         | ingredient/egg (plural alias)                     |
| `chook`        | ingredient/chicken                                |
| (~20 more)     | covering common AU/US variants                    |

### `substitutions` (~10)

A mix of global and one recipe-scoped (used by the smash-burger sample recipe):

| From         | To        | Ratio | Context tags          |
| ------------ | --------- | ----- | --------------------- |
| butter       | olive-oil | 0.75  | `["savory","frying"]` |
| olive-oil    | butter    | 1.33  | `["savory","frying"]` |
| onion:yellow | onion:red | 1.0   | `["savory"]`          |
| egg          | olive-oil | 0.5   | `["baking"]`          |
| (~6 more)    |           |       |                       |

Plus one recipe-scoped: in `smash-burger` recipe, substitute `cheese:colby-block` with `cheese:cheddar-shredded` at ratio 1.0.

### Sample recipes (5)

Each in `body_dsl` form, all to be compiled via PRD-116 during seed.

#### 1. `caramelised-onions` (component)

```
@recipe(
  slug="caramelised-onions",
  title="Caramelised Onions",
  servings=4,
  prep_time=5:min,
  cook_time=40:min,
  recipe_type="component"
)
@yield(caramelised-onion, 1:count)

## Ingredients
@ingredient(1, onion:yellow:sliced, 4:count)
@ingredient(2, butter, 30:g)
@ingredient(3, olive-oil, 15:ml)
@ingredient(4, salt, 5:g)

## Steps
@step("Heat the @2 and @3 in a wide pan over medium heat until the @2 melts.")
@step("Add the @1 and a pinch of @4. Stir to coat.")
@step("Cook over low heat for @time(40:min), stirring every few minutes until deep golden brown.")
```

Exercises: component recipe, mixed compact/positional descriptors, multiple ingredient refs in steps, inline `@time`.

#### 2. `smash-patty` (component, exercises recipe-as-ingredient when referenced from #4)

```
@recipe(
  slug="smash-patty",
  title="Smash Patty",
  servings=4,
  prep_time=5:min,
  cook_time=10:min,
  recipe_type="component"
)
@yield(smash-patty, 4:count)

## Ingredients
@ingredient(1, beef:chuck:minced, 500:g)
@ingredient(2, salt, 5:g)
@ingredient(3, pepper:black-ground, 2:g)

## Steps
@step("Divide @1 into 4 equal balls. Season with @2 and @3.")
@step("Heat a heavy pan over high heat until smoking. Place a ball in the pan and smash flat with a spatula.")
@step("Cook for @time(2:min), flip, cook another @time(1:min). Repeat for remaining balls.")
```

Exercises: simple component, two prep_states on the same ingredient line.

#### 3. `caramelised-cheese-toastie` (plate, references caramelised-onions)

```
@recipe(
  slug="caramelised-cheese-toastie",
  title="Caramelised Onion & Cheese Toastie",
  servings=1,
  prep_time=2:min,
  cook_time=8:min
)
@yield(toastie, 1:count)

## Ingredients
@ingredient(1, bread:sourdough-loaf:sliced, 2:count)
@ingredient(2, butter:softened, 20:g)
@ingredient(3, cheese:cheddar-shredded, 60:g)
@ingredient(4, caramelised-onions, 0.25:count, notes="about a quarter of one batch")

## Steps
@step("Butter the outside of each @1 slice with @2.")
@step("On the unbuttered side of one slice, layer @3 and @4.")
@step("Top with the second slice (buttered side out) and grill in a pan over medium heat for @time(4:min) per side until golden.")
```

Exercises: recipe-as-ingredient (`caramelised-onions` reference), decimal qty, optional notes on a line.

#### 4. `smash-burger` (plate, references smash-patty)

```
@recipe(
  slug="smash-burger",
  title="Smash Burger",
  servings=4,
  prep_time=5:min,
  cook_time=2:min
)
@yield(smash-burger, 4:count)

## Ingredients
@ingredient(1, bread:burger-bun:sliced, 4:count)
@ingredient(2, smash-patty, 4:count)
@ingredient(3, cheese:colby-block:sliced, 4:count)
@ingredient(4, onion:yellow:sliced, 0.5:count)
@ingredient(5, butter:softened, 20:g, optional=true)

## Steps
@step("Toast the @1 in the pan if @5 was used; otherwise dry-toast.")
@step("Place a slice of @3 on each @2 while still in the hot pan to melt.")
@step("Assemble: bottom bun, patty with cheese, @4, top bun.")
```

Exercises: recipe-as-ingredient (`smash-patty`), optional ingredient, named-arg form on the optional line, multi-ingredient plate.

#### 5. `basic-omelette` (named-arg form throughout, for parser coverage)

```
@recipe(
  slug="basic-omelette",
  title="Basic Omelette",
  servings=1,
  prep_time=2:min,
  cook_time=3:min
)
@yield(omelette, 1:count)

## Ingredients
@ingredient(1, "egg", qty=3, unit="count")
@ingredient(2, "butter", qty=10, unit="g")
@ingredient(3, "salt", qty=2, unit="g")
@ingredient(4, "pepper", variant="black-ground", qty=1, unit="g")

## Steps
@step("Beat @1 in a bowl. Season with @3 and @4.")
@step("Melt @2 in a small non-stick pan over medium heat.")
@step("Pour egg mixture in, swirl to coat, cook for @time(90:s) until just set.")
```

Exercises: named-arg ingredient form, time in seconds, no recipe refs.

## Mise task

### `db:seed:food`

Add to `mise.toml`:

```toml
[tasks."db:seed:food"]
description = "Seed the food domain (ingredients, variants, prep_states, aliases, substitutions, sample recipes)"
run = "pnpm --filter @pops/api db:seed:food"
```

Underlying script in `apps/pops-api/scripts/seed-food.ts`:

1. Open the SQLite DB (uses `SQLITE_PATH` env).
2. Verify required tables exist (`ingredients`, `recipes`, etc.); abort with clear error if any are missing.
3. Clear existing food rows (in dependency order: batch_consumptions → recipe_runs → batches → recipe_lines → recipe_steps → recipe_version_proposed_slugs → recipe_versions → recipes → plan_entries → list_items → lists → substitutions → ingredient_aliases → ingredient_variants → slug_registry rows for kind ∈ ('ingredient','recipe','prep_state') → ingredients → prep_states → plan_slots where is_default=1).
4. Insert seed data via the services from `packages/app-food/` (NOT raw INSERTs — exercises the service layer and `slug_registry` integration).
5. For each sample recipe: call `createRecipe`, `createNewVersion`, set `body_dsl`, then invoke `compileRecipeVersion` (PRD-116). Assert `compile_status='compiled'` for each. Promote v1 of each to `current`.
6. Print summary: counts per table.

### `db:seed` (existing) — coordination

Update `apps/pops-api/src/db/seeder.ts` to also call into food's seeder when the food module is installed. Detection: presence of `ingredients` table. If absent (food not installed), skip silently.

## Business Rules

- Seed is destructive: it clears existing food rows before inserting. Operators are warned via task description; running it on a real database is at-your-own-risk (matches the existing `db:seed` pattern).
- Seed uses the same service layer that production code uses. No raw `INSERT INTO ingredients` — always via `createIngredient`. This proves the services work end-to-end.
- All sample recipes MUST compile cleanly. If any seed-time `compileRecipeVersion` returns `{ ok: false }`, the seed task exits non-zero with the error details.
- The seed is deterministic — running it twice produces the same DB state (clear + insert pattern).
- Seed must complete in <30 seconds on a developer laptop. Soft target; failure triggers profiling.

## Edge Cases

| Case                                                                                                                                       | Behaviour                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Running `db:seed:food` against a DB without the food schema                                                                                | Aborts with clear error: "food schema not present; run migrations first".                                                                                                                                                                                       |
| Running `db:seed:food` when `slug_registry` has user-added rows that collide with seed slugs                                               | Service throws `SlugAlreadyRegisteredError`; seed surfaces it; operator must clean up.                                                                                                                                                                          |
| Running `db:seed:food` twice in a row                                                                                                      | Second run clears and re-inserts; final state identical to first run.                                                                                                                                                                                           |
| Sample recipe `caramelised-cheese-toastie` references `caramelised-onions` whose compile hasn't run yet                                    | Seed inserts recipes in dependency order: components first (caramelised-onions, smash-patty), then plates that reference them. Required because PRD-115 resolves recipe-as-ingredient refs against `recipes.current_version_id`, which is null until promotion. |
| Sample recipes' `@yield(...)` slugs (e.g. `caramelised-onion`, `toastie`, `smash-burger`, `omelette`) aren't in the seeded ingredient list | Auto-create per PRD-115: compile creates the yield ingredient row and its slug_registry entry before materialising. Seed task does NOT need to pre-insert these — they fall out of the normal compile pipeline.                                                 |
| Sample recipe uses a prep_state slug not in the curated seed list                                                                          | Compile fails with `UnresolvedPrepStateSlug`. All prep_state slugs referenced by sample recipes MUST appear in the 15 listed in `§ prep_states`. If a future sample recipe needs a new prep_state, add it to the seed list.                                     |
| Compile failure on a sample recipe                                                                                                         | Seed exits with error including the `CompileResult` JSON and a pointer to the recipe slug. Test fixtures need updating, not the seeder.                                                                                                                         |
| `db:seed` invoked without food installed                                                                                                   | Food block is skipped silently; rest of seed proceeds normally.                                                                                                                                                                                                 |
| Re-seeding with `plan_slots` rows that the user customised                                                                                 | Only `is_default=1` rows are cleared and reinserted; user-added slots survive.                                                                                                                                                                                  |

## Acceptance Criteria

Inline per theme protocol.

### Tooling

- [ ] `mise.toml` gains the `db:seed:food` task definition.
- [ ] `apps/pops-api/package.json` has a matching `db:seed:food` script invoking `scripts/seed-food.ts`.
- [ ] `mise db:seed:food` runs to completion on a freshly-migrated DB.
- [ ] `mise db:seed` (existing task) calls the food seeder when the food schema is detected.

### Fixture content

- [ ] After running, the DB contains: ≥20 ingredients, ≥50 variants, 15 prep_states, ~30 aliases, ~10 substitutions, 5 sample recipes (all with `compile_status='compiled'` and `recipes.current_version_id` set), 5 default plan_slots.
- [ ] Recipe `caramelised-cheese-toastie` and `smash-burger` correctly have `recipe_lines` rows where `is_recipe_ref=1` pointing at `caramelised-onions` and `smash-patty` respectively.
- [ ] No `recipe_version_proposed_slugs` rows after seed (everything resolves cleanly).

### Smoke tests

- [ ] Vitest test at `apps/pops-api/scripts/__tests__/seed-food.test.ts` runs the seeder against an in-memory DB and asserts the row counts.
- [ ] After seed, a query for "what can I cook tonight given a batch of smash-patty and ingredients in pantry?" returns at least `smash-burger`.
- [ ] After seed, the recipe-graph cycle detector run against `smash-burger` returns `ok: true`.

### Documentation

- [ ] PRD-113 cross-link landed in PRD-107's "Out of Scope" section (or the recipe service docs) so future doc readers know where the seed is.
- [ ] `pillars/food/docs/README.md` epic table status for Epic 00 may flip to `Done` once this PRD's acceptance is met AND the prior 6 PRDs' acceptance is met.

## Implementation phasing

PRD-113 ships in three sub-phases so the seed unblocks downstream work as Epic 00 / I1b PRDs land:

- **Phase 1** — non-compile fixture set (ingredients + variants + prep_states + aliases + substitutions + plan slots + plan entries + lists + batches + uncompiled recipe headers). Does NOT depend on PRD-116. Shipped.
- **Phase 2** — sample recipe DSL bodies parsed → resolved → cycle-checked → materialised via `compileRecipeVersion` (PRD-116). Closes the cross-PRD smoke this PRD was originally specced as. Also picks up `unit_conversions` + `ingredient_weights` seed rows from PRD-123.
- **Phase 3** — `ingest_sources` provenance fixtures so PRD-135's inbox inspector renders against real rows (two rows, one `url-instagram` + one `url-web`, linked bidirectionally with seeded draft recipes via `recipe_versions.source_id` and `ingest_sources.draft_recipe_id`). Paths follow PRD-110's `<source_id>/<filename>` layout. Shipped.

Phase split lives in the private roadmap (`.claude/food-app-roadmap.md`); each phase ships as its own PR.

## Out of Scope

- Bulk import of common-ingredient datasets (USDA, Open Food Facts) — deferred. Hand-curated 20 is enough for v1.
- Seeding `recipe_runs` or `batches` user-history — Phase 1 seeds the minimum needed to exercise `recipe_runs` ↔ `batches` ↔ `batch_consumptions` wiring; broader user-history fixtures stay out of scope.
- Performance tuning of the seed beyond the 30-second target.
- Localisation of seed data (Australian English in v1; the user is in AU).
- Sample plan entries — _superseded by Phase 1, which seeds plan slots + entries to exercise PRD-111's schema._
- Sample shopping lists — _superseded by Phase 1, which seeds two lists (one shopping, one generic) via PRD-112's services._
- `ingest_sources` fixtures — _superseded by Phase 3 (two rows so PRD-135's inbox surface has provenance to render against)._
