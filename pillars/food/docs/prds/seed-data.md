# Seed Data

Status: **Done.** A food-only dev seeder wipes the food pillar's SQLite tables and inserts a small but realistic fixture set that exercises every food schema constraint and drives the DSL compile pipeline end to end — the seed run doubles as the cross-domain compile smoke test.

## Purpose

Give a freshly-migrated food DB enough hand-curated content to develop and demo against: ingredients with variants and a shallow hierarchy, prep states, aliases, substitutions, sample recipes that actually compile, a week of meal plan, on-hand batches with one cook run, and two ingest-source provenance rows. Sample recipes are included deliberately — the parse → resolve → cycle-check → materialise compile path only proves out when invoked against real data.

The seeder uses the food pillar's own service layer (`createRecipe`, `promoteVersion`, tag/alias services, etc.) and Drizzle schema, not raw `INSERT`s, so the seed exercises the same code production uses.

## Surface

- **Runner** — `pillars/food/scripts/db-seed-food.ts`, invoked by `pnpm db:seed:food` (pillar `package.json`) and the root mise task `db:seed:food` (which sets `SQLITE_PATH=pillars/food/data/food.db` and runs in `pillars/food`).
- **Entry point** — `seedFood(foodDb, { compileRecipeVersion? })` in `src/seed/index.ts`. Returns a per-table count summary.
- The seeder is food-scoped only. It does **not** touch other pillars' DBs (each pillar owns its own SQLite file) and there is no cross-domain coordinator.

## Behaviour

1. Refuses to run when `NODE_ENV=production`; aborts if the DB file at `SQLITE_PATH` (default `./data/pops.db`) is missing.
2. In a transaction with `foreign_keys=OFF`, `DELETE`s every food table (children first) including the compile-output tables `recipe_lines` / `recipe_steps` / `recipe_version_proposed_slugs` and the conversion tables `unit_conversions` / `ingredient_weights` so re-runs stay idempotent against their UNIQUE constraints.
3. Calls `seedFood`, which short-circuits to `{ skipped: true }` with zero counts when `slug_registry` already has rows — mixing seeded and non-seeded rows is unsupported; callers wipe first.
4. Steps run in dependency order: prep_states → ingredients+variants → ingredient_tags → aliases → conversions → ingest_sources → recipes (compile+promote) → link ingest_sources to drafts → substitutions → plan → batches.
5. Prints a count summary per table.

When a `compileRecipeVersion` callback is supplied (the CLI passes the real `compileRecipeVersion` from `src/dsl/compile.ts`), each recipe is compiled and its v1 promoted to `current` inline, so later fixtures can reference earlier ones via recipe-as-ingredient. Without the callback (the in-package Vitest suite), recipes land as uncompiled drafts.

## Fixture set

- **prep_states (15):** the canonical list (`whole`, `diced`, `sliced`, `chopped`, `shredded`, `minced`, `julienned`, `grated`, `crushed`, `zested`, `juiced`, `melted`, `softened`, `mashed`, `roughly-chopped`).
- **ingredients (23):** 20 top-level across the (default_unit × variants × shelf_life) matrix — salt, pepper, olive-oil, butter, egg, flour, sugar, milk, cheese, onion, garlic, tomato, potato, carrot, lemon, corn, parsley, bread, chicken, beef — plus 3 depth-2 children (tomato → roma-tomato + cherry-tomato; potato → desiree-potato). 56 variants. Density on olive-oil (0.91) / milk (1.03); fridge/freezer shelf-life on perishables; pantry items leave shelf-life NULL.
- **Shelf-life propagation:** `default_shelf_life_days_fridge` / `_freezer` are columns on `ingredient_variants`. Per-ingredient defaults propagate to every variant unless a variant overrides them (corn: fresh-cob 5d fridge, canned-brine 365d fridge, frozen-kernels 365d freezer; tomato canned variants 365d).
- **aliases (33):** AU/US alternatives targeting either an ingredient or a variant (exactly one), e.g. `scallion`/`spring onion` → onion:spring, `evoo` → olive-oil:extra-virgin, `passata` → tomato:canned-whole, `chook` → chicken, `mince`/`ground beef` → beef:mince. Persisted with `source='user'` (the alias-source enum has no `seed` value).
- **substitutions (10):** 9 global + 1 recipe-scoped (cheddar→colby pinned to `smash-burger`). Every context tag (savory, sweet, baking, frying, dressing, marinade, garnish, vegan, dairy-free, gluten-free) appears on at least one edge.
- **recipes (5):** `smash-patty` (component), `smash-burger` (plate, references smash-patty via recipe-as-ingredient), `weeknight-pasta`, `roast-chicken`, `breakfast-eggs` (named-arg DSL form). Bodies follow the recipe DSL grammar; all compile and promote to `current`. Yield slugs not in the ingredient list are auto-created by the compile path.
- **conversions:** 13 `unit_conversions` (kg/mg/oz/lb→g, l/cl/fl-oz/cup/tbsp/tsp→ml, each/whole/piece→count) + 6 `ingredient_weights` (variant-specific flour/sugar/salt; null-variant butter fallback). All rows `isSeeded=true` so the conversions CRUD UI blocks deletes.
- **plan:** 6 plan_slots (5 default + `late-night` user-added with `is_default=0`) anchored to a stable Monday; 9 plan_entries mixing slotted dinners/lunches, snack-slot ad-hoc entries, and a Sunday prep-session with two positioned entries.
- **batches (10) + 1 recipe_run + consumptions:** spans shelf-stable (NULL `expires_at`), fridge/freezer, two same-variant milk batches with different expiry (FIFO fixture), a NULL-prep-state onion, and one `source_type='recipe_run'` batch wired to a seeded smash-burger cook run that draws from the freezer beef batch.
- **ingest_sources (2):** one `url-instagram` (full provenance: caption, transcript, keyframes, video, extracted JSON) and one `url-web` (minimal: extracted JSON only). Both linked bidirectionally to a seeded draft recipe (`recipe_versions.source_id` ↔ `ingest_sources.draft_recipe_id`). Media paths stored in the `<source_id>/<filename>` layout; no files written to disk.
- **ingredient_tags:** `store-section:*` tags on seeded ingredients for the five sections that have content (produce, dairy incl. eggs, meat, pantry, bakery — bread); sparse sections (frozen, condiments, beverages) are intentionally left empty.

## Business rules

- Destructive: clears existing food rows before inserting; running against a real DB is at-your-own-risk.
- Seed uses the service layer, not raw inserts — proves services + `slug_registry` integration end to end.
- Deterministic: dates are anchored to fixed constants; re-running after a wipe reproduces the same DB state.
- All sample recipes MUST compile cleanly; a `{ ok: false }` from any `compileRecipeVersion` throws with the recipe slug and phase, and the seed exits non-zero.

## Edge cases

- DB missing at `SQLITE_PATH` → abort with a clear "run `mise db:init`" hint.
- `slug_registry` already populated → `seedFood` returns `skipped: true`, zero counts (idempotent no-op short of a wipe).
- Plate references a component whose compile hasn't run → recipes are seeded in dependency order (components before plates) so the recipe-as-ingredient resolver finds a promoted `current_version_id`.
- Yield slugs absent from the ingredient list → auto-created by the compile pipeline; the seeder does not pre-insert them.
- Sample recipe references an unknown prep_state → compile fails; every prep_state slug used by a fixture must be in the canonical 15.

## Acceptance criteria

- [x] `mise run db:seed:food` (root) and `pnpm db:seed:food` (pillar) run the seeder against the food pillar's dev DB.
- [x] After running: ≥20 ingredients, ≥50 variants, 15 prep_states, ≥30 aliases, 10 substitutions (≥1 recipe-scoped), 5 recipes, 6 plan_slots, 9 plan_entries, 10 batches, 1 recipe_run, 2 ingest_sources, ≥10 unit_conversions, ≥4 ingredient_weights, ≥4 store-section tags.
- [x] With the compile callback, every recipe ends `compile_status='compiled'`, `status='current'`, `current_version_id` set, with `recipe_lines` and `recipe_steps` materialised and no surviving `recipe_version_proposed_slugs`.
- [x] `smash-burger` has exactly one `recipe_lines` row with `is_recipe_ref=1` pointing at `smash-patty`; cycle detection on `smash-burger` returns `ok: true`.
- [x] Variant shelf-life inheritance and per-variant overrides hold (butter all-variants 30d/365d; corn fresh-cob/canned/frozen distinct).
- [x] Substitution coverage spans all 10 context tags (savory, sweet, baking, frying, dressing, marinade, garnish, vegan, dairy-free, gluten-free); ≥1 recipe-scoped edge present.
- [x] Batches mix NULL and explicit `expires_at`, include a freezer batch, two same-variant milk batches with distinct expiry, and a NULL-prep-state batch; the recipe_run's `yielded_batch_id` FKs back to a batch.
- [x] Both `ingest_sources` rows are linked both ways; only `smash-burger` + `weeknight-pasta` appear in the `recipe_versions.source_id IS NOT NULL` inbox-scope query; media paths use the `<source_id>/<filename>` layout.
- [x] Re-running `seedFood` over a populated DB returns `skipped: true` with row counts intact.
- [x] Vitest suites cover the above: phase-1/3 (`src/db/__tests__/seed.test.ts`) and phase-2 compile smoke (`src/seed/__tests__/seed-phase-2.test.ts`).

## Out of scope

- Cross-domain seed coordination, lists/list-item fixtures, and bulk dataset import — see `docs/ideas/seed-data-extensions.md`.
- Localisation (Australian English only in v1); seed performance tuning.
