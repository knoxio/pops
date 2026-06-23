# Planning Page & Plan Entries API

Status: **Done** — week-grid planning surface at `/food/plan` and the `/plan/*` REST surface are shipped. Recipe-version pinning is exposed on the wire but has no UI control yet; draft-only recipe selection and archived-version/archived-recipe cell tags are unbuilt → `docs/ideas/planning-page-version-pinning.md`. Recurrence, week templates, calendar export, and soft-delete remain in `docs/ideas/plan-scheduling-extensions.md`.

## Purpose

`/food/plan` is the week-grid meal-planning surface: plan a week of cooks across slots, drag entries between cells, edit servings/notes inline, navigate weeks, and manage the slot vocabulary. The page consumes the existing `plan_entries` + `plan_slots` schema and adds no tables of its own. "Mark cooked" hands off to the recipe cook flow; "Make shopping list" hands off to the plan-derived shopping generator.

## Data model (existing schema, owned by `plan-entry-model`)

- `plan_slots(slug PK, name, display_order DEFAULT 100, is_default DEFAULT 0)` — extensible slot vocabulary. Seeded defaults (breakfast/lunch/dinner/snack/prep-session) carry `is_default=1`; the service refuses to delete them.
- `plan_entries(id PK, date TEXT YYYY-MM-DD, slot FK→plan_slots.slug, position DEFAULT 0, recipe_id FK→recipes.id, recipe_version_id FK→recipe_versions.id NULL, planned_servings DEFAULT 1 CHECK >0, recipe_run_id FK→recipe_runs.id NULL, notes, created_at)`. Dates are ISO `YYYY-MM-DD` strings, no time component. `recipe_version_id` NULL = resolve `recipes.current_version_id` at read/cook time. `recipe_run_id` NULL = "planned"; set by the cook flow, never by this surface. Indexed on `date`, `(date, slot)`, and `recipe_id`.

## REST API (`/plan/*`, ts-rest contract `rest-plan.ts`, mounted under the food pillar)

| Method & path                         | Purpose                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /plan/week?weekStart=YYYY-MM-DD` | Denormalised week view (server normalises to ISO Monday)                        |
| `GET /plan/slots`                     | List slots ordered by `display_order, slug`                                     |
| `POST /plan/slots`                    | Add custom slot `{ slug, name }`                                                |
| `PATCH /plan/slots/:slug`             | Rename / reorder `{ name?, displayOrder? }`                                     |
| `DELETE /plan/slots/:slug`            | Delete custom slot                                                              |
| `POST /plan/entries`                  | Add entry `{ date, slot, recipeId, plannedServings, recipeVersionId?, notes? }` |
| `PATCH /plan/entries/:id`             | Edit `{ plannedServings?, recipeVersionId?, notes? }`                           |
| `POST /plan/entries/:id/move`         | Move to another `{ date, slot, position? }`                                     |
| `DELETE /plan/entries/:id`            | Hard-delete an uncooked entry                                                   |
| `POST /plan/reorder`                  | Reorder a cell `{ date, slot, orderedIds }`                                     |

Mutations return a discriminated `{ ok: true, ... } | { ok: false, reason }` body on **200**; the client narrows on `reason`. Only `GET /plan/week` can **400** (a date matching the `YYYY-MM-DD` regex but not a real calendar day). Entry-mutation reasons: `NotFound | AlreadyCooked | BadDate | BadSlot | RecipeArchived | RecipeHasNoCurrentVersion`. Reorder: `BadIds` (the union also declares `EmptySlot`, but it is currently unreachable — an empty `orderedIds` is rejected at contract validation by `.min(1)` before the handler runs). Slot add: `SlugTaken | SlugInvalid`. Slot update: `SlotNotFound | CannotEditDefault`. Slot delete: `SlotNotFound | CannotDeleteDefault | SlotInUse`.

`weekView` projection: normalise to ISO Monday (date-fns in code — SQLite has no ISO-week function), `weekEnd = +6 days`, then one query joining `plan_entries → recipes`, the resolved version via `COALESCE(plan_entries.recipe_version_id, recipes.current_version_id)`, and `recipe_runs.completed_at`. Each wire row carries `recipeSlug, recipeTitle, recipeType, heroImagePath, plannedServings, recipeVersionId, recipeRunId, recipeRunCookedAt, notes` so the client never re-queries for cell rendering. Rows ordered `(date, slot, position, id)`.

## Routes & page

- `/plan` (and `?week=YYYY-MM-DD`) → `PlanPage`, registered in the food app manifest with a "Plan" sidebar entry. `week` normalises to the ISO Monday; default is the current ISO week in the user's local timezone. Header has prev / Today / next + a native date picker that snaps to the Monday, plus "Manage slots" and "Make shopping list" (navigates to `/food/shopping/from-plan?start=&end=` for the current week).
- Add / edit are in-page overlays (modal + side/bottom sheet), not standalone routes.

## Business rules

- Default load week = current ISO week, local timezone. All dates stored as `YYYY-MM-DD`.
- `POST /plan/entries` rejects `RecipeArchived` if the recipe is archived, and `RecipeHasNoCurrentVersion` when the recipe has no current version and no explicit `recipeVersionId`. A pinned `recipeVersionId` must belong to the recipe (else `NotFound`).
- Entries with `recipe_run_id` set are locked: `PATCH`, `move`, and `DELETE` reject `AlreadyCooked`. `recipe_run_id` is only ever set by the cook flow.
- `move` without `position` appends at `MAX(position)+1` for the target cell. Source-cell positions are not renumbered — gaps are acceptable; ordering is `(position, id)`.
- `reorder` rejects `BadIds` unless every id is unique and already belongs to the `(date, slot)` cell.
- Slot deletion rejects `CannotDeleteDefault` for `is_default=1` and `SlotInUse` if any `plan_entries` row references the slug (any date). Slot rename rejects `CannotEditDefault` for default slots; reorder (`displayOrder`) is allowed on defaults.
- Custom slug grammar: the client form validates `^[a-z][a-z0-9-]{0,31}$` before submit; the server/contract accept the broader canonical food slug grammar `^[a-z0-9]+(-[a-z0-9]+)*$` (≤64 chars) and return `SlugInvalid` otherwise. Name required, ≤64 chars. Slot order is `display_order` then `slug`.
- Planned servings CHECK-constrained `> 0`; the UI also floors inputs at 1.
- Plan has no horizon limit; past-dated entries are allowed and remain interactive.

## Acceptance criteria

Routes & shell

- [x] `/food/plan` page + "Plan" sidebar entry registered in the food app manifest.
- [x] `PlanPage` reads `?week=…`, renders that ISO week (default = current); prev / Today / next + date picker rewrite the URL to the ISO Monday.
- [x] "Make shopping list" header button navigates to the plan-derived shopping generator pre-filled with the current week.

Grid & swiper

- [x] Desktop (≥768px) renders a 7-column × N-slot grid; rows sorted by `display_order, slug`.
- [x] Mobile (<768px) renders a day-at-a-time swiper sharing the same cell components.
- [x] Entry cards show title truncated to 18 chars (full title in `title` tooltip), an `×N` servings badge when `>1`, and a "cooked" chip when `recipe_run_id` is set.
- [x] A `[+]` button per cell opens the Add modal pre-filled with `(date, slot)`.
- [x] Past-date cells render desaturated (entries still interactive); cells where every entry is cooked render with a green tint.

Drag-and-drop (`@dnd-kit`)

- [x] Dragging an entry to another cell calls `POST /plan/entries/:id/move`; success invalidates the week query (React Query refetch).
- [x] Dragging within a cell calls `POST /plan/reorder`.
- [x] Cooked entries are non-draggable: the handle is greyed with an explanatory `title`.
- [x] Touch drag works via a press-delay `TouchSensor`; keyboard sensor supported.

Edit sheet

- [x] Clicking an entry opens a right-drawer (≥768px) / bottom-sheet (<768px) with the recipe title linking to `/food/recipes/:slug`, a servings input, and a notes textarea.
- [x] "Mark cooked" links into the recipe cook flow (`/food/recipes/:slug?cook=:id`).
- [x] Save calls `PATCH /plan/entries/:id`; Delete calls `DELETE /plan/entries/:id`.
- [x] When `recipe_run_id` is set the sheet is read-only, shows "Cooked on …", and links to the cook record; no Delete.

Add modal

- [x] Recipe picker is a typeahead search over `POST /recipes/search` (archived excluded) feeding a combobox; servings (default 1) and optional notes; Add calls `POST /plan/entries` and closes.

Slot management

- [x] "Manage slots" opens a drawer listing all slots; default slots are reorderable but not renamable/deletable; custom slots support inline rename + delete (rejected `SlotInUse` when referenced).
- [x] "Add custom slot" form validates the slug grammar client-side before `POST /plan/slots`.

API

- [x] All 10 `/plan/*` endpoints exist with the discriminated `{ ok, reason }` contract; entry/slot mutations are transactional.
- [x] `weekView` returns JOIN-resolved title / type / hero / cookedAt and 400s on an unreal date.
- [x] Every reachable `reason` code fires on its condition (the reorder `EmptySlot` code is declared in the wire union but unreachable — `.min(1)` rejects an empty `orderedIds` at validation).

Polling

- [x] The week query refetches every 60s while the page is visible (not in background).

Tests

- [x] API integration coverage at `src/api/__tests__/plan.test.ts` exercises each endpoint including error reasons.
- [x] Component/RTL coverage at `app/src/pages/plan/__tests__/PlanPage.test.tsx` covers grid render, add, edit, and the slot drawer + slug guard.
- [ ] Playwright E2E (add → drag → edit → delete round-trip) — still deferred.

## Out of scope

Cook modal (recipe cook flow), plan-derived shopping list (its own generator), recurrence / week templates, calendar export, soft-delete/archive of entries, cross-week drag, plan-wide bulk scaling, full-plan search, plan import, multi-user shared plans, and a cross-week cook history view (`recipe_runs` is the source of truth). Recipe-version pinning UI and draft-only recipe selection are deferred — see the ideas files referenced in the status line.
