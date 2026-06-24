# Plan Entry Model

Status: Done — schema, slot vocabulary, service layer, and the full `plan.*` REST contract are implemented and wired. Deferred extensions (recurring entries, week templates, balanced-week suggestions, soft-delete/archive, .ics export) live in `../../ideas/plan-scheduling-extensions.md`.

## Purpose

The meal plan. A plan entry says "on date D, in slot S, intend to cook recipe R at N servings". Multiple recipes share a `(date, slot)` cell — Tuesday dinner can be appetizer + main + dessert, ordered by `position`. Slot vocabulary is extensible: a small `plan_slots` table seeded with defaults (breakfast, lunch, dinner, snack, prep-session), and the user can add their own (`elevenses`, `brunch`, `late-night`).

Cook execution (turning a plan entry into a `recipe_runs` row) and the plan UI itself are owned by other PRDs; the cook flow writes back `plan_entries.recipe_run_id` to mark an entry as cooked.

## Data Model

### `plan_slots`

| column        | type    | notes                                                                                    |
| ------------- | ------- | ---------------------------------------------------------------------------------------- |
| slug          | TEXT PK | lowercase-kebab-case                                                                     |
| name          | TEXT    | display label                                                                            |
| display_order | INTEGER | default 100; controls UI ordering, ties by slug                                          |
| is_default    | INTEGER | `1` for seeded defaults — seed re-runner skips them, service refuses to delete/edit them |

Seeded defaults: breakfast (10), lunch (20), dinner (30), snack (40), prep-session (50), all `is_default=1`. User-added slots default to `display_order=100` and `is_default=0`.

### `plan_entries`

| column            | type               | notes                                                                                      |
| ----------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| id                | INTEGER PK autoinc |                                                                                            |
| date              | TEXT               | ISO `YYYY-MM-DD`; range queries pivot on this                                              |
| slot              | TEXT               | `REFERENCES plan_slots(slug)`                                                              |
| position          | INTEGER            | default 0; ordering within a `(date, slot)` cell                                           |
| recipe_id         | INTEGER            | `REFERENCES recipes(id)`                                                                   |
| recipe_version_id | INTEGER            | `REFERENCES recipe_versions(id)`; **nullable** = use recipe's current version at cook time |
| planned_servings  | INTEGER            | default 1, `CHECK (planned_servings > 0)`                                                  |
| recipe_run_id     | INTEGER            | `REFERENCES recipe_runs(id)`; null = "planned", set = "cooked"                             |
| notes             | TEXT               | nullable                                                                                   |
| created_at        | TEXT               | `default datetime('now')`                                                                  |

Indexes: `idx_plan_entries_date`, `idx_plan_entries_date_slot`, `idx_plan_entries_recipe`, and the partial `idx_plan_entries_unscheduled ON (recipe_id) WHERE recipe_run_id IS NULL`. No UNIQUE on `(date, slot, position)` — multiple entries per cell are allowed; `position` then `id` is the tiebreaker.

## REST API Surface

ts-rest contract `plan.*` under `/plan`:

- `GET /plan/week?weekStart=YYYY-MM-DD` — denormalised week view. Normalises any date to its containing ISO Monday, returns `{ weekStart, weekEnd, slots[], entries[] }`. Each entry carries `recipeSlug`, `recipeTitle`, `recipeType`, `heroImagePath`, resolved version, `recipeRunId`, `recipeRunCookedAt`. Bad ISO date → 400.
- `GET /plan/slots` — list slots in `(display_order, slug)` order.
- `POST /plan/slots` `{ slug, name }` → `SlugTaken` / `SlugInvalid`.
- `PATCH /plan/slots/:slug` `{ name?, displayOrder? }` → `SlotNotFound` / `CannotEditDefault` (name edits on a default are rejected; `displayOrder` is editable).
- `DELETE /plan/slots/:slug` → `SlotNotFound` / `CannotDeleteDefault` / `SlotInUse`.
- `POST /plan/entries` `{ date, slot, recipeId, plannedServings, recipeVersionId?, notes? }` → `{ ok, id, position }` or `BadDate` / `BadSlot` / `NotFound` / `RecipeArchived` / `RecipeHasNoCurrentVersion`.
- `PATCH /plan/entries/:id` `{ plannedServings?, recipeVersionId?, notes? }` → rejects once cooked (`AlreadyCooked`).
- `POST /plan/entries/:id/move` `{ date, slot, position? }` — moves to another cell; rejects once cooked.
- `DELETE /plan/entries/:id` → `NotFound` / `AlreadyCooked`.
- `POST /plan/reorder` `{ date, slot, orderedIds[] }` — reassigns `position` 0..n-1; `BadIds` if any id isn't in the cell or the list has dupes.

Mutations return the service's discriminated `{ ok, reason }` on 200; the FE narrows on `reason`. Only `weekView` returns 400.

## Business Rules

- Effective version resolves at read/cook time via `COALESCE(plan_entries.recipe_version_id, recipes.current_version_id)`. A null pin means "whatever's current".
- Plan entries persist after cooking — they are NOT deleted when `recipe_run_id` is set; the historical plan is preserved.
- Deleting/editing/moving a cooked entry (`recipe_run_id` set) is rejected at the service/handler layer (`PlanEntryHasCookEvent` / `AlreadyCooked`).
- `addEntry` guards the recipe before insert: rejects archived recipes (`RecipeArchived`), recipes with no current version and no pin (`RecipeHasNoCurrentVersion`), and pinned versions that don't belong to the recipe (`NotFound`).
- Adding a custom slot inserts `is_default=0`, `display_order=100`; `addSlot`/`addCustomSlot` validate the slug shape. Defaults cannot be deleted or have their name edited.
- A slot with any referencing `plan_entries` row cannot be deleted (`SlotInUse`).
- Append position is `max(position)+1` within the `(date, slot)` cell. Reorders are last-write-wins (single-user); the reorder runs in one transaction so partial reorders never escape.
- Plan entries may reference an archived recipe (entry persists; UI warns) and dates in the past (retroactive logging is allowed).
- The shopping generator loads in-range entries with `recipe_run_id IS NULL` (already-cooked entries don't contribute); the week view joins through to `recipe_runs.completed_at` for the cooked badge.

## Edge Cases

- `planned_servings = 0` → CHECK rejects.
- `slot` not in `plan_slots` → FK rejection (`BadSlot` at the handler).
- `recipe_id` to a deleted recipe → FK rejection.
- Same `(date, slot)` multiple times → allowed, returned in `position` then `id` order.
- Recipe with null `current_version_id` and no pin → `addEntry` returns `RecipeHasNoCurrentVersion`; cook later fails too.
- `display_order` tie between two slots → sorted by slug.

## Acceptance Criteria

### Schema

- [x] `plan_slots` and `plan_entries` tables exist with the columns, CHECK, FKs, and four indexes (including the partial `WHERE recipe_run_id IS NULL`), asserted by the schema-smoke and invariant suites.
- [x] Seed inserts the 5 default slots (`is_default=1`) plus a sample custom slot.

### Service layer (`src/db/services/plan.ts`)

- [x] `addPlanEntry` accepts an optional `recipeVersionId` (null = current) and auto-appends `position`.
- [x] `removePlanEntry` throws `PlanEntryNotFound` for unknown ids and `PlanEntryHasCookEvent` when `recipe_run_id` is set.
- [x] `reorderSlot` reassigns positions 0..n-1 in one transaction.
- [x] `addSlot`/`addCustomSlot` validate the slug and reject duplicates (`PlanSlotSlugAlreadyExists`); `updateSlot` patches name/order; `deleteSlot` refuses defaults (`PlanSlotIsDefault`) and in-use slots (`PlanSlotInUse`); `listSlots` orders by `(display_order, slug)`.

### REST handlers (`src/api/rest/plan-handlers.ts`, contract `plan.*`)

- [x] `GET /plan/week` returns the denormalised week view; `entries[]` is ordered `(date, slot, position, id)` and the separate `slots[]` array carries `display_order` so the UI renders slot rows in display order; a date passing the regex but not a real day → 400.
- [x] Slot CRUD + entry CRUD + `move` + `reorder` map service errors to the discriminated `{ ok, reason }` union and reject mutations on cooked entries.

### Invariants (Vitest, `src/db/__tests__/plan-entries.test.ts`)

- [x] CHECK rejects `planned_servings = 0`; FK rejects bad slot, deleted recipe, and a bogus `recipe_run_id`.
- [x] Multiple entries per `(date, slot)` return in `position` order; `reorderSlot` reassigns in caller order.
- [x] `addCustomSlot('elevenses')` succeeds; `deleteSlot('breakfast')` (default) → `PlanSlotIsDefault`; deleting an in-use slot → `PlanSlotInUse`.
- [x] Deleting a cooked entry → `PlanEntryHasCookEvent`.
- [x] The "this week" query returns rows in `(date, display_order, position)` order; an archived recipe's entry persists.
