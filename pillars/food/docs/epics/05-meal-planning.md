# Epic 05: Meal Planning & Batches

> Theme: [Food](../README.md)

## Scope

Build the surfaces that turn `plan-entry-model`'s `plan_entries` and `batch-model`'s `batches` / `recipe_runs` / `batch_consumptions` from schema into a working meal-prep loop. A week-grid planning page (`/food/plan`) where the user drags recipes into slots; a "Mark cooked" / "Cook now" modal that runs the FIFO consumption against the fridge and produces a yielded batch; a fridge inventory view (`/food/fridge`) that browses every batch with location grouping and expiry sort; per-batch edit affordances (relocate, change expiry, delete).

After this epic, the user can plan Sunday batch-prep on Saturday, cook on Sunday, see the yielded batches land in `/food/fridge` with auto-calculated expiry, then plan Tuesday's plate that consumes those batches FIFO. The full meal-prep loop closes.

This epic is **not** plan-derived shopping (Epic 07), substitutions (Epic 06), or the "what should I cook tonight" solver (Epic 06). Just plan + cook + fridge.

## PRDs

| #   | PRD                                                                      | Summary                                                                                                                   | Status      |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 143 | [Planning Page & Plan Entries API](../prds/planning-page/README.md)      | `/food/plan` week-grid + day-swiper mobile; plan_entries CRUD tRPC; drag-drop reschedule; custom-slot CRUD                | Not started |
| 144 | [Cook Event Recording](../prds/cook-event-recording/README.md)           | Single "Mark cooked" modal (from plan entry) + "Cook now" (from recipe detail); transactional cook mutation               | Not started |
| 145 | [Batch Lifecycle](../prds/batch-lifecycle/README.md)                     | Batch creation services consumed by `cook-event-recording`; manual batch entry; relocate; expiry override; batch deletion | Not started |
| 146 | [FIFO Consumption UI Integration](../prds/fifo-consumption-ui/README.md) | Consume-preview + shortfall surfacing in cook modal; batch-override mode; "consumed externally" fallback                  | Not started |
| 147 | [Fridge Inventory View](../prds/fridge-view/README.md)                   | `/food/fridge` browse-all-batches page; location grouping; expiry sort; filters; per-batch edit row actions               | Not started |

### Build order

```
143 ──► 144 ──► (145, 146 in parallel) ──► 147
```

- **`planning-page`** first — the plan grid is the most prominent surface and the entry point for cook events. Plan entry CRUD API also unblocks `cook-event-recording`.
- **`cook-event-recording`** owns the cook modal shell. It depends on `planning-page`'s plan entry API for the "Mark cooked" entry point.
- **PRDs 145 and 146** specialise the cook modal (`batch-lifecycle` = batch creation; `fifo-consumption-ui` = consumption preview / shortfalls) and can be built in parallel after `cook-event-recording`'s shell exists.
- **`fridge-view`** is independent of the cook flow but consumes `batch-lifecycle`'s batch services for the row-level edit actions. Lands last.

## Dependencies

- **Requires:** Epic 00 (especially `recipe-model` `recipe_versions`, `batch-model` `batches` / `recipe_runs` / `batch_consumptions` + FIFO helper, `plan-entry-model` `plan_entries` + `plan_slots`, `seed-data` seed data).
- **Requires:** Epic 01 (`app-shell` module shell mounting; `recipe-crud-pages` `food.recipes.*` router and `RecipeDetailPage` for the "Cook now" entry; `dsl-renderer` renderer for the inline view in the cook modal).
- **Requires:** Epic 00 services exposed by `batch-model` — `consumeForRun(needs, db)`, `markRunComplete(runId, opts)` — both called transactionally inside `cook-event-recording`'s cook mutation.
- **Unlocks:** Epic 06 (substitution-aware consumption layers on `fifo-consumption-ui`'s surface). Epic 07 (plan-derived shopping list consumes `planning-page`'s date-range query).

## Key Decisions

| Decision                | Choice                                                                                                                                                                                                                                                                                                                                                                        | Rationale                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan grid layout        | Week × slot grid (Mon-Sun columns × N slot rows, ordered by `plan_slots.display_order`). Mobile (<768px) collapses to a day-at-a-time swiper                                                                                                                                                                                                                                  | Week-at-a-glance matches the batch-prep mental model; columns map to grocery / prep rhythm. Mobile pivot keeps the surface usable on a phone in the kitchen                             |
| Week boundary           | ISO weeks (Monday-Sunday), local timezone                                                                                                                                                                                                                                                                                                                                     | Matches most cooking calendars worldwide; Sunday-Saturday confuses meal-prep planning that treats Sunday as the prep day                                                                |
| Cook event UX           | Single "Mark cooked" modal — actual scale, yield qty (auto-fill + edit), location radio, rating 1-5, notes. Batches consumed shown read-only (FIFO defaults; overrideable via `fifo-consumption-ui`)                                                                                                                                                                          | One screen. Fewest taps. Wizard would add friction for the 80% case (cook as planned). `fifo-consumption-ui` layers in the override controls for the 20% case (shortfall, substitution) |
| Ad-hoc cook entry       | Recipe detail page only — "Cook now" entry in `recipe-crud-pages`'s action menu                                                                                                                                                                                                                                                                                               | One surface to learn. Plan-grid retroactive logging is satisfied by adding a back-dated plan entry then immediately Mark cooked                                                         |
| Cook transaction        | A new `food.cook.markCooked` tRPC mutation wraps `INSERT recipe_runs` + `batch-model`'s `consumeForRun` + `markRunComplete` in one Drizzle transaction. Plan entry's `recipe_run_id` is set in the same transaction iff the cook started from a plan entry                                                                                                                    | Atomic — either the cook is fully recorded (run row, consumed batches, yielded batch, plan link) or nothing is. Prevents zombie plan entries that point at runs that rolled back        |
| Locations model         | Keep `batch-model`'s hardcoded enum (pantry / fridge / freezer / other). No ADR in this epic                                                                                                                                                                                                                                                                                  | The "extensible locations" ADR candidate is deferred. `batch-model`'s `'other'` value covers the long tail until inventory theme matures                                                |
| Plan entry edit         | Click a plan entry opens an inline edit sheet (not full page) with: servings, version pin, notes, "Mark cooked" button, link to recipe detail                                                                                                                                                                                                                                 | Keeps the user in the plan context. Sheet = side-panel on desktop, bottom-sheet on mobile                                                                                               |
| Reschedule              | Drag a plan entry between cells = update `(date, slot)`. Within a cell = reorder `position`. Touch: long-press → drag                                                                                                                                                                                                                                                         | Standard drag-drop UX; aligns with `crud-ui`'s reorder pattern                                                                                                                          |
| Custom slots            | The plan page settings menu exposes a slot-CRUD surface (add a custom slot, rename, reorder, soft-delete). Default slots (`is_default=1`) can be reordered but not deleted                                                                                                                                                                                                    | `plan-entry-model` already supports it at the schema layer; UI just needs to surface it                                                                                                 |
| Shortfall UX            | The cook modal lists every shortfalling line with two per-row options: (a) "Pick a batch to consume" (override the FIFO miss with a manual batch — may be a different variant if substitutions UI lands later), or (b) "Mark consumed externally" (record the consumption-need but skip writing a `batch_consumptions` row). Submit blocked until every shortfall is resolved | Prevents accidentally cooking with nothing tracked while leaving an escape hatch for "I used the one from the cupboard I forgot to log"                                                 |
| Fridge view default     | `/food/fridge` lists every batch with `qty_remaining > 0`, grouped by location (collapsible sections), sorted by `expires_at ASC NULLS LAST`                                                                                                                                                                                                                                  | Expiry-first is the most actionable view. Location grouping mirrors physical reality                                                                                                    |
| Batch row actions       | Per-row menu: Edit (qty + expiry + notes), Relocate (location radio), Delete (with confirm for non-empty), Cook now (recipe picker filtered to recipes consuming this variant)                                                                                                                                                                                                | "Cook now from batch" is a small power-user affordance; not the primary cook flow                                                                                                       |
| Empty-batch retention   | Batches with `qty_remaining = 0` are hidden from `/food/fridge` by default; a "Show empties" toggle reveals them. Empty batches are never deleted on their own (preserved for cook history per `batch-model`)                                                                                                                                                                 | Default surface stays focused on edible inventory; history is a click away                                                                                                              |
| Recipe-run history page | `/food/recipes/:slug/runs` (a sub-page of `recipe-crud-pages`'s recipe detail) lists all `recipe_runs` for the recipe. Read-only in v1; clicking a row opens the cook detail (mini-modal)                                                                                                                                                                                     | Closes the loop on "v3 was rated higher than v2" without a separate cook-history surface. Deferred to a small sub-PRD if needed                                                         |

## Risks

- **FIFO consumption surprises the user** — The default picks one batch over another; user may want a specific batch. Mitigation: `fifo-consumption-ui`'s override mode is one click away.
- **Cook modal becomes a god-form** — Scale + yield + location + rating + notes + consume preview + shortfalls + overrides is a lot. Mitigation: `cook-event-recording` sets the modal scaffold (essentials always visible); `fifo-consumption-ui` layers shortfall+override as a collapsible panel that's hidden in the happy path.
- **Plan-entry drag races with cook completion** — User drags a plan entry while another tab marks it cooked. Mitigation: services check `plan_entries.recipe_run_id IS NULL` before applying drag updates; if non-null, the drag rejects with a toast.
- **Mobile drag-drop UX is finicky** — Long-press + drag on touch can mis-fire with scroll. Mitigation: `planning-page` uses an established library (react-dnd or equivalent — same as `crud-ui`'s reorder); explicit "Move to..." menu fallback for accessibility.
- **Expiry-day calculations have timezone bugs** — `produced_at + N days` near midnight risks off-by-one. Mitigation: `batch-lifecycle` computes expiry in the user's local timezone using `date-fns`; tests pin the boundary cases.
- **Variant + prep_state combinatorial explosion in `/food/fridge`** — "Chicken breast diced", "Chicken breast sliced", "Chicken breast whole" each list separately. Mitigation: `fridge-view` groups by `ingredient` first (collapsible), with variant + prep_state as sub-rows. The user sees "Chicken (3 batches)" by default and expands.
- **Batch deletion has cook-history implications** — Deleting a non-empty batch loses provenance. Mitigation: `batch-lifecycle`'s delete confirm explicitly warns; deletion sets `qty_remaining=0` + a `deleted_at` column (NEW per `batch-lifecycle`) rather than hard-deleting. The cook history JOIN through `batch_consumptions` still resolves.
- **Plan-entry across recipe rename** — User renames a recipe's slug after planning; plan_entries.recipe_id is stable so the row still works. UI surfaces the current name regardless. No data risk.

## Out of Scope

- Plan-derived shopping list generation — **Epic 07**.
- Pantry subtraction in shopping (live "what do I still need?" check) — **Epic 07**.
- Substitution-aware consumption (allow consuming whole onion when recipe asks for diced) — **Epic 06**.
- "What can I cook tonight?" solver — **Epic 06**.
- Recurring plan entries ("Tuesday is taco night") — deferred.
- Plan templates / week templates — deferred.
- Expiry notifications / push alerts — theme-level decision (no notifications in v1).
- Cooking-mode full-screen view (timer-driven, voice-controlled) — out of scope for Epic 05; revisit post-Epic-05.
- Calendar export (.ics) — deferred.
- Batch QR codes / sticker printing — out of scope.
- Multi-output recipes (chicken → meat + bones + stock) — per ADR-022, single-yield only.
- Receipt scanning to auto-create purchase batches — out of scope (cross-domain with finance theme).
- Cook-history analytics (cuisine breakdown, monthly cook count) — out of scope.
- Bulk-mark-cooked across multiple plan entries — out of scope; one at a time.
- Inventory locations cross-domain ADR — explicitly deferred per the Key Decisions table.
