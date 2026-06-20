# PRD-111: Plan Entry Model

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Define the `plan_entries` table — the meal plan. A plan entry says "on date D in slot S, intend to cook recipe R at servings N". Multiple recipes may share a (date, slot) — Tuesday dinner can be appetizer + main + dessert. Slot vocabulary is extensible via a small `plan_slots` table seeded with defaults (breakfast, lunch, dinner, snack, prep-session) so the user can add their own (`elevenses`, `brunch`, `late-night`).

Cook execution (turning a plan entry into a `recipe_run` per PRD-108) is service logic that lives in Epic 05. PRD-111 just defines the schema and the slot vocabulary.

## Data Model

### `plan_slots`

```sql
CREATE TABLE plan_slots (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 100,
  is_default   INTEGER NOT NULL DEFAULT 0           -- 1 for seeded defaults
);
```

Seeded by PRD-113 with:

| slug         | name         | display_order |
| ------------ | ------------ | ------------- |
| breakfast    | Breakfast    | 10            |
| lunch        | Lunch        | 20            |
| dinner       | Dinner       | 30            |
| snack        | Snack        | 40            |
| prep-session | Prep session | 50            |

`display_order` controls UI ordering. User-added slots default to 100 and slot into the bottom; UI may offer drag-to-reorder.

`is_default` flags seeded rows so the seed re-runner knows not to duplicate, and so the UI can choose to forbid deletion of defaults.

### `plan_entries`

```sql
CREATE TABLE plan_entries (
  id                INTEGER PRIMARY KEY,
  date              TEXT NOT NULL,                   -- ISO date, YYYY-MM-DD
  slot              TEXT NOT NULL REFERENCES plan_slots(slug),
  position          INTEGER NOT NULL DEFAULT 0,      -- ordering within a (date, slot)
  recipe_id         INTEGER NOT NULL REFERENCES recipes(id),
  recipe_version_id INTEGER REFERENCES recipe_versions(id),  -- pin to a version; null = use current
  planned_servings  INTEGER NOT NULL DEFAULT 1 CHECK (planned_servings > 0),
  recipe_run_id     INTEGER REFERENCES recipe_runs(id),       -- set when the plan entry becomes a cook
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_plan_entries_date           ON plan_entries(date);
CREATE INDEX idx_plan_entries_date_slot      ON plan_entries(date, slot);
CREATE INDEX idx_plan_entries_recipe         ON plan_entries(recipe_id);
CREATE INDEX idx_plan_entries_unscheduled    ON plan_entries(recipe_id) WHERE recipe_run_id IS NULL;
```

No PK on `(date, slot)` — multiple entries per slot allowed. `position` orders them within the slot (0, 1, 2 ... in display order).

`recipe_version_id` is **nullable** — null means "use the recipe's current version when cooking time comes". Pinning is for the "I want to cook v3 specifically" case (rare; usually you want whatever's current). At cook time, the planner snapshots `recipes.current_version_id` into the `recipe_run` regardless of whether `plan_entries.recipe_version_id` was set.

`recipe_run_id` is set when the plan entry transitions from "planned" to "cooking" — the service that creates a `recipe_run` from a plan entry writes this FK. A plan entry with a non-null `recipe_run_id` is "in progress" or "done"; with null, it's "planned".

## Date Range Queries

The two queries Epic 05 will run constantly:

```sql
-- "Show this week's plan, ordered for display"
SELECT pe.*, ps.display_order
FROM plan_entries pe
JOIN plan_slots ps ON ps.slug = pe.slot
WHERE pe.date BETWEEN ? AND ?
ORDER BY pe.date, ps.display_order, pe.position;

-- "What components do I need to prep this Sunday for the upcoming week's plates?"
SELECT DISTINCT rl.recipe_ref_id
FROM plan_entries pe
JOIN recipes r ON r.id = pe.recipe_id
JOIN recipe_versions rv ON rv.id = COALESCE(pe.recipe_version_id, r.current_version_id)
JOIN recipe_lines rl ON rl.recipe_version_id = rv.id
WHERE pe.date BETWEEN ? AND ?
  AND rl.is_recipe_ref = 1;
```

The second query depends on `recipe_lines` from PRD-116 being materialised — another reason Epic 00's build order has 116 before 111 in the consumer order even though their schemas are independent.

## Business Rules

- A plan entry references either a specific version (`recipe_version_id` set) or "whatever's current" (`recipe_version_id` null). Service helpers always resolve the effective version at read time via `COALESCE(pe.recipe_version_id, r.current_version_id)`.
- Plan entries persist after cooking. They are NOT deleted when `recipe_run_id` is set — the historical plan is preserved.
- Deleting a plan entry with a non-null `recipe_run_id` is forbidden at the service layer (would orphan the run's "planned" context). Use archive semantics (deferred — not in v1 schema; `created_at` ordering is enough for now).
- Adding a user-defined slot: INSERT into `plan_slots` with `is_default=0` and `display_order=100`. Service prevents deleting `is_default=1` slots.
- Reordering recipes within a slot updates `position` for all affected rows. Concurrent reorders are last-write-wins; rare contention in single-user mode.
- A plan entry can reference an archived recipe (`recipes.archived_at IS NOT NULL`). The UI surfaces a warning ("this recipe was archived after planning"); the entry is not auto-deleted.

## Edge Cases

| Case                                                                          | Behaviour                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two plan entries with same (date, slot, position)                             | Allowed by schema (no UNIQUE on the tuple). Reorder service tries to keep positions unique within (date, slot) but doesn't enforce. UI sorts by position then by id as tiebreaker. |
| Plan entry with `slot='made-up-slot'` not in `plan_slots`                     | FK rejection.                                                                                                                                                                      |
| Plan entry for a recipe that gets archived after planning                     | Entry persists. UI shows "(archived)" label. Cooking the plan still works.                                                                                                         |
| Plan entry for a recipe whose `current_version_id` is null (no promotion yet) | Cook attempt fails at the cook service: "no current version to cook". Plan entry persists.                                                                                         |
| Multi-recipe slot (appetizer + main + dessert) with position 0, 1, 2          | Renders in order. No restrictions on count.                                                                                                                                        |
| Plan entry deleted before cooking                                             | Hard delete; no cascade beyond the row.                                                                                                                                            |
| Plan entry's `recipe_version_id` points at an archived version                | Allowed. Cook proceeds with that version (per the pin); UI warns.                                                                                                                  |
| Date in the past                                                              | Allowed. Useful for retroactive logging (cooked X yesterday).                                                                                                                      |
| Slot `display_order` ties between two slots                                   | UI sorts by slug as secondary key.                                                                                                                                                 |
| Inserting `plan_entries.planned_servings = 0`                                 | CHECK rejects.                                                                                                                                                                     |

## Acceptance Criteria

Inline per theme protocol.

### Schema

- [x] Migration adds `plan_slots` and `plan_entries` per the SQL above.
- [ ] PRD-113 (seed) inserts the 5 default slots. _(deferred — PRD-113 owns the seed insertion. The PRD-111 invariant suite seeds an equivalent vocabulary in-memory so the FK can be exercised standalone.)_
- [x] Drizzle schema and `packages/db-types` regenerated.
- [x] Indexes verified.

### Service layer

- [x] `packages/app-food/src/db/services/plan.ts` exposes typed methods: `addPlanEntry`, `removePlanEntry`, `reorderSlot`, `addCustomSlot`.
- [x] `addPlanEntry` accepts `recipe_version_id` as optional (null = use current).
- [x] `removePlanEntry` rejects deletion when `recipe_run_id IS NOT NULL` with `PlanEntryHasCookEvent`.

### Invariants (each verified by a Vitest case)

- [x] Inserting a plan entry with `planned_servings = 0` fails the CHECK.
- [x] Inserting a plan entry with `slot='nonexistent'` fails the FK.
- [x] Inserting a plan entry with `recipe_id` referencing a deleted recipe fails the FK.
- [x] Adding multiple plan entries with the same `(date, slot)` succeeds and they're returned in `position` order.
- [x] `addCustomSlot('elevenses', 'Elevenses')` succeeds; `deleteSlot('breakfast')` (a default) is rejected by service with `PlanSlotIsDefault`.
- [x] Deleting a plan entry with `recipe_run_id` set is rejected by service.

### Tests

- [x] Vitest suite at `packages/app-food/src/db/__tests__/plan-entries.test.ts` covers each invariant and the multi-recipe-per-slot ordering case.
- [x] Test for the "this week's plan" query returns rows in `(date, ps.display_order, position)` order.

## Out of Scope

- Plan UI (calendar grid, drag-drop, mobile layout) — Epic 05 PRD.
- Cook flow (turning a plan entry into a recipe_run) — Epic 05 PRD.
- Recurring plan entries ("every Tuesday is taco night") — deferred.
- Plan templates / week templates — deferred.
- Suggestions ("here's a balanced week") — deferred (cerebrum-cross-domain territory).
- Plan-derived shopping list generation — Epic 04 / 07 PRD.
- Calendar export (.ics) — deferred.
