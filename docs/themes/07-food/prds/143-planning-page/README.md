# PRD-143: Planning Page & Plan Entries API

> Epic: [05 — Meal Planning & Batches](../../epics/05-meal-planning.md)

## Overview

Build `/food/plan` — the week-grid meal planning surface — plus the `food.plan.*` tRPC router that backs it. Drag-and-drop plan entries between cells; click a plan entry to open an inline edit sheet; navigate weeks; add / rename / reorder custom slots. Mobile pivots to a day-at-a-time swiper. PRD-111's `plan_entries` + `plan_slots` schema is consumed as-is; this PRD adds zero new tables.

After this PRD, the user can plan a week's worth of dinners in a few minutes, see Sunday's prep session next to Tuesday's plate, and trigger the cook flow (PRD-144) by clicking "Mark cooked" inside a plan entry's edit sheet.

This is the largest UI PRD in Epic 05 — it stands up the planning surface that PRDs 144-147 build on.

## Routes

| Path                         | Page       | Purpose                                                              |
| ---------------------------- | ---------- | -------------------------------------------------------------------- |
| `/food/plan`                 | `PlanPage` | Week grid; default week = current ISO week                           |
| `/food/plan?week=YYYY-MM-DD` | `PlanPage` | Week containing the given date (always normalises to the ISO Monday) |

Sub-routes for "add entry" and "edit entry" are modals overlaid on the parent, using query params `?add=YYYY-MM-DD&slot=dinner` and `?edit=<planEntryId>` — same pattern as PRD-140. No standalone page.

Plan navigation: header has prev / today / next arrows + a date picker dropdown that snaps to the ISO Monday of the picked date.

## Page Specifications

### Header

- **Week label**: "Week of <Mon date> — <Sun date>" (e.g. "Week of 8 Jun — 14 Jun 2026"). Clicking the label opens a date-picker dropdown.
- **Prev / Today / Next** arrow buttons. "Today" snaps to the current ISO week.
- **Settings menu** (gear icon) opens:
  - "Manage slots..." — drawer showing all `plan_slots` rows with reorder (drag), rename (inline), delete (only `is_default=0` rows). "+ Add slot" form at the bottom.
  - Future v2: "Plan settings" — week start day override (currently ISO Monday only).

### Grid (desktop, ≥768px)

```
┌────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│        │   Mon    │   Tue    │   Wed    │   Thu    │   Fri    │   Sat    │   Sun    │
│        │   8 Jun  │   9 Jun  │   10 Jun │   11 Jun │   12 Jun │   13 Jun │   14 Jun │
├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│Breakf. │   [+]    │ Oatmeal  │   [+]    │   [+]    │   [+]    │ Pancakes │   [+]    │
├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│Lunch   │ Salad    │   [+]    │ Soup     │   [+]    │ Salad    │   [+]    │   [+]    │
├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│Dinner  │ Tikka    │ Tacos    │   [+]    │ Pasta    │   [+]    │   [+]    │   [+]    │
│        │ Patties  │          │          │          │          │          │          │
├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│Snack   │   [+]    │   [+]    │   [+]    │   [+]    │   [+]    │   [+]    │   [+]    │
├────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│Prep    │   [+]    │   [+]    │   [+]    │   [+]    │   [+]    │   [+]    │ Patties  │
│session │          │          │          │          │          │          │          │
└────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

Cell content:

- Each plan entry shows: recipe title (truncated to 18 chars + ellipsis), small chip if `recipe_run_id IS NOT NULL` (status: cooked / cooking), tiny servings-count badge if `planned_servings > 1`.
- Multiple entries stack vertically within the cell, ordered by `position`.
- `[+]` button at the bottom of each cell (always visible) opens the "Add entry" modal pre-filled with that `(date, slot)`.
- Past dates (date < today) render with a slight desaturation; entries remain interactive.
- Cells where the day-cooked-already (every entry has `recipe_run_id`) get a subtle green tint.

### Mobile (<768px) — day swiper

- One day visible at a time. Day label header (Mon 8 Jun). Swipe left / right (or arrow buttons) moves between days. Vertical scroll through slots within the day.
- Each slot renders as a section with the same per-entry rows as the grid.
- "Add entry" affordance: `[+]` button at the bottom of each slot section.
- Bottom sticky bar shows "Week of <Mon-Sun>" + "Switch to grid" link (only on tablet portrait, since phones are too narrow for a usable grid).

### Plan entry edit sheet

Clicking a plan entry opens a side-panel (desktop) / bottom-sheet (mobile) with:

- **Recipe title** (link → `/food/recipes/:slug`).
- **Planned servings** (number input, ≥1).
- **Version pin** dropdown (default: "Current version"; explicit list shows version numbers + status).
- **Notes** textarea.
- **Status row**: "Planned" if `recipe_run_id IS NULL`; otherwise "Cooked on <date>" with a link to `/food/recipes/:slug/runs/<id>` (deferred sub-page) and disabled fields.
- **Buttons**:
  - **Mark cooked** — primary CTA when status is "Planned". Opens PRD-144's cook modal.
  - **Save changes** — secondary; updates servings / version / notes.
  - **Delete** — only when `recipe_run_id IS NULL`. Confirms.
  - **Cancel**.

### Add entry modal

Pre-filled `(date, slot)` from the trigger (`?add=YYYY-MM-DD&slot=...`).

- **Recipe picker**: typeahead search over `recipes` (not archived; `current_version_id IS NOT NULL`). Selected recipe shows hero thumbnail + title + recipe_type chip.
- **Planned servings** (default 1).
- **Version pin** (default: "Current").
- **Notes** (optional).
- **Buttons**: Cancel / Add.

On Add: calls `food.plan.addEntry({ date, slot, recipeId, plannedServings, recipeVersionId?, notes? })`, modal closes, grid optimistically inserts the row.

### Drag-and-drop

- Drag a plan entry to a different cell: `food.plan.moveEntry({ id, date, slot, position })`. Position defaults to bottom of the target cell.
- Drag within the same cell: `food.plan.reorderSlot({ date, slot, orderedIds })`.
- Forbid drag when `plan_entries.recipe_run_id IS NOT NULL` (cooked entries lock to their date). Drag handle is greyed; tooltip explains.
- Mobile: long-press initiates drag.
- Library: `react-dnd` (same as PRD-140's reorder).

## tRPC API

```ts
// apps/pops-api/src/modules/food/router.ts (extends; the food module's router)
food.plan.weekView: query({
  input: { weekStart: string },                    // ISO date; server normalises to ISO Monday
  output: WeekView,
});

food.plan.addEntry: mutation({
  input: {
    date: string,                                  // ISO YYYY-MM-DD
    slot: string,                                  // FK plan_slots.slug
    recipeId: number,
    plannedServings: number,                       // ≥1
    recipeVersionId?: number,                      // null/undefined = use current at cook time
    notes?: string,
  },
  output: { id: number, position: number },
});

food.plan.updateEntry: mutation({
  input: {
    id: number,
    plannedServings?: number,
    recipeVersionId?: number | null,
    notes?: string | null,
  },
  output: { ok: true } | { ok: false, reason: PlanEntryError },
});

food.plan.moveEntry: mutation({
  input: { id: number, date: string, slot: string, position?: number },
  output: { ok: true } | { ok: false, reason: PlanEntryError },
});

food.plan.reorderSlot: mutation({
  input: { date: string, slot: string, orderedIds: number[] },
  output: { ok: true } | { ok: false, reason: 'BadIds' | 'EmptySlot' },
});

food.plan.deleteEntry: mutation({
  input: { id: number },
  output: { ok: true } | { ok: false, reason: PlanEntryError },
});

food.plan.listSlots: query({
  input: {},
  output: { slots: PlanSlotRow[] },                 // ordered by display_order, slug
});

food.plan.addSlot: mutation({
  input: { slug: string, name: string },
  output: { ok: true } | { ok: false, reason: 'SlugTaken' | 'SlugInvalid' },
});

food.plan.updateSlot: mutation({
  input: { slug: string, name?: string, displayOrder?: number },
  output: { ok: true } | { ok: false, reason: 'SlotNotFound' | 'CannotEditDefault' },
});

food.plan.deleteSlot: mutation({
  input: { slug: string },
  output: { ok: true } | { ok: false, reason: 'SlotNotFound' | 'CannotDeleteDefault' | 'SlotInUse' },
});

export type WeekView = {
  weekStart: string;                                 // normalised ISO Monday
  weekEnd: string;                                   // Sunday
  slots: PlanSlotRow[];
  entries: PlanEntryRow[];                           // every entry in the 7-day range
};

export type PlanEntryRow = {
  id: number;
  date: string;
  slot: string;
  position: number;
  recipeId: number;
  recipeSlug: string;
  recipeTitle: string;
  recipeType: string | null;                         // PRD-107's recipe_type for chip rendering
  heroImagePath: string | null;                      // PRD-124's `recipes.hero_image_path`; client constructs the card-thumbnail URL
  plannedServings: number;
  recipeVersionId: number | null;
  recipeRunId: number | null;
  recipeRunCookedAt: string | null;                  // recipe_runs.completed_at if set
  notes: string | null;
};

export type PlanSlotRow = {
  slug: string;
  name: string;
  displayOrder: number;
  isDefault: boolean;
};

export type PlanEntryError =
  | 'NotFound'
  | 'AlreadyCooked'                                  // mutation on a recipe_run_id-set entry that's forbidden
  | 'BadDate'                                        // malformed date
  | 'BadSlot'                                        // slot not in plan_slots
  | 'RecipeArchived'                                 // recipe was archived between read and write
  | 'RecipeHasNoCurrentVersion';                     // attempting to add when recipes.current_version_id IS NULL
```

### `weekView` server-side flow

1. Parse `weekStart`; normalise to ISO Monday in code via `date-fns startOfISOWeek` (POPS is SQLite — no native ISO-week date function).
2. Compute `weekEnd = weekStart + 6 days`.
3. SELECT `plan_slots` ORDER BY `display_order, slug`.
4. SELECT `plan_entries` JOIN `recipes` JOIN `recipe_versions` (via `COALESCE(plan_entries.recipe_version_id, recipes.current_version_id)`) WHERE `plan_entries.date BETWEEN weekStart AND weekEnd`. Include `recipe_runs.completed_at` via LEFT JOIN.
5. Return `WeekView`.

One round-trip per week. Cell-level data is denormalised into `PlanEntryRow` so the client never needs to re-query for chip / hero rendering.

### `moveEntry` server-side flow

1. Validate entry exists; `recipe_run_id IS NULL` (else `AlreadyCooked`).
2. Validate `slot` is in `plan_slots`; `date` parses (else `BadSlot` / `BadDate`).
3. UPDATE `plan_entries SET date, slot, position` to the new values. If `position` is omitted, use `MAX(position) + 1` for the target cell.
4. Single transaction.

Re-renumbering other entries in the source cell is NOT done — gaps in `position` are acceptable. Source cell shows the remaining entries in their existing order.

## Business Rules

- Default week on initial page load = current ISO week in user's local timezone.
- All dates stored as `YYYY-MM-DD` strings (matches PRD-111). No time-of-day component.
- `food.plan.addEntry` rejects with `RecipeHasNoCurrentVersion` when the recipe has no current version AND no explicit `recipeVersionId` is provided. The user can still add an entry pinned to a specific draft version.
- A plan entry's `recipe_run_id` is set by PRD-144's cook mutation, NOT by this PRD's mutations. This PRD only sets it to NULL implicitly (creation).
- Plan entry deletion is hard delete; rejected with `AlreadyCooked` when `recipe_run_id` is set.
- Slot deletion rejected with `SlotInUse` if any `plan_entries.slot = <slug>` exists (any date). User must move entries to a different slot first.
- Custom slot slug must be lowercase, hyphen-separated, max 32 chars, unique. Server validates with `/^[a-z][a-z0-9-]{0,31}$/`.
- Custom slot name is required, max 64 chars.
- Slot reorder updates `display_order` on every affected slot; one transaction.
- A plan entry pinned to an archived recipe version is allowed; UI shows a "(archived version)" tag in the cell.
- A plan entry for a recipe that gets archived after planning is allowed; UI shows "(archived recipe)" tag.

## Edge Cases

| Case                                                                 | Behaviour                                                                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| User opens `/food/plan?week=invalid-date`                            | Falls back to current week; URL normalised via `router.replace`.                                                                        |
| User opens `/food/plan?week=2026-02-29`                              | Date doesn't exist; falls back to current week with a small toast.                                                                      |
| User drags entry to a different cell while another tab cooks it      | First write wins. If cook landed first, drag receives `AlreadyCooked` and rejects; cell refreshes.                                      |
| User adds entry to a future date 100 weeks out                       | Allowed. Plan has no horizon limit. Performance OK because `weekView` queries one week at a time.                                       |
| Drag onto a cell during cook completion of another entry             | Both mutations succeed if independent. React Query invalidates the week on cook completion.                                             |
| User reorders within a slot, then drags one out                      | Last action wins. Position gaps acceptable. Next `weekView` returns rows in `(position, id)` order.                                     |
| Mobile: very long recipe title (50 chars)                            | Truncates to 18 chars + ellipsis with a tooltip / long-press preview.                                                                   |
| Slot with `display_order` tie between two custom slots               | Sort by `slug` as secondary.                                                                                                            |
| User deletes a custom slot with entries on past dates                | Rejected with `SlotInUse`. User must move historical entries (rare) or accept the slot lives forever.                                   |
| User attempts to add a slot with slug `breakfast` (existing default) | `SlugTaken`.                                                                                                                            |
| User adds an entry to a date in the past                             | Allowed (matches PRD-111). Cell renders with desaturation; cook flow works.                                                             |
| Recipe picker shows recipes whose `current_version_id IS NULL`       | Excluded from default picker. A "Show draft-only recipes" checkbox surfaces them; selecting one auto-sets `recipeVersionId` to a draft. |
| User pins a `recipe_version_id` that's `status='archived'`           | Allowed. UI shows "(archived version)" warning.                                                                                         |
| Drag during inflight `weekView` poll                                 | React Query optimistic update; reconciles on poll response.                                                                             |
| User edits servings to 0                                             | Server CHECK rejects (`planned_servings > 0`); UI also blocks Save.                                                                     |
| Two simultaneous reorderSlot calls on the same slot                  | Last write wins. Re-fetch reconciles.                                                                                                   |

## Acceptance Criteria

Inline per theme protocol.

### Routes & shell

- [x] `/food/plan` registered in PRD-118's `app-food` manifest with both the page and the sidebar entry.
- [x] Sidebar entry "Plan" mounted under Food in nav.
- [x] `PlanPage` reads `?week=...` and renders the appropriate ISO week; default = current.
- [x] Prev / Today / Next + date picker control the URL.

### Grid

- [x] Desktop (≥768px) renders the 7-col × N-slot grid with `display_order` row sort.
- [x] Mobile (<768px) renders a day-at-a-time swiper.
- [x] Plan entry cells show title (truncated), status chip, servings badge.
- [x] `[+]` button per cell opens the Add modal pre-filled with `(date, slot)`.
- [x] Past-date cells render desaturated; entries interactive.
- [x] Day-cooked cells render with green tint.

### Drag-and-drop

- [x] Drag between cells calls `food.plan.moveEntry`; the grid refreshes via React Query invalidation on success (optimistic cache update is a follow-up).
- [x] Drag within a cell calls `food.plan.reorderSlot`.
- [x] Drag handles greyed and tooltip explains on `recipe_run_id IS NOT NULL` entries.
- [x] Mobile long-press initiates drag.

### Edit sheet

- [x] Clicking an entry opens the edit sheet with all spec'd fields.
- [x] "Mark cooked" button opens PRD-144's cook modal.
- [x] Save calls `food.plan.updateEntry`.
- [x] Delete is hidden when `recipe_run_id` is set.

### Slot management

- [x] Settings menu opens the slot-CRUD drawer.
- [x] Default slots are reorderable but not deletable.
- [x] Custom slots are addable / renameable / deletable (when not in use).
- [x] Slot slug validation per the regex.

### tRPC

- [x] All procedures in the API section exist at `apps/pops-api/src/modules/food/router.ts`.
- [x] All mutations are transactional.
- [x] `weekView` returns `PlanEntryRow` with JOIN-resolved title / hero / type / cookedAt.
- [x] All error codes from `PlanEntryError` fire on their respective conditions.

### Polling

- [x] `weekView` refetches every 60s while page is visible.

### Tests

- [x] Vitest + RTL at `packages/app-food/src/pages/plan/__tests__/PlanPage.test.tsx` covers grid render + edit + add + slot drawer + slug-regex guard. (DnD pointer interactions exercised by `@dnd-kit`'s own coverage; RTL DnD test is a follow-up.)
- [x] Vitest integration at `apps/pops-api/src/modules/food/__tests__/plan-router.test.ts` covers each procedure including error cases.
- [ ] E2E: add 3 entries → drag one to a new cell → edit servings → delete one → all reflected on next reload. _(Gap — Playwright E2E deferred to follow-up issue.)_

### Mobile

- [x] Day swiper readable at 375px.
- [x] Long-press drag works on touch.
- [x] Edit sheet renders as a bottom-sheet.

## Out of Scope

- The cook modal — **PRD-144**.
- Plan-derived shopping list — Epic 07.
- Recurring entries / week templates — deferred.
- Calendar export — deferred.
- Notifications for upcoming planned cooks — none in v1.
- Plan-wide "scale everything for this week up by 2×" — out of scope.
- Cross-week drag (drag entry from this week to next) — out of scope in v1; week-at-a-time editing only.
- Searching across the whole plan (full-text) — out of scope.
- Plan import from external sources (cookbook PDFs, etc.) — out of scope.
- Multi-user shared plans — single-user.
- A "history" view that lists every cooked plan entry across all weeks — `recipe_runs` is the source of truth; deferred sub-page.

## Requires (cross-PRD dependencies)

- **PRD-107** — `recipe_versions.title`, `recipes.slug`, `recipes.archived_at`, `recipes.current_version_id`.
- **PRD-108** — `recipe_runs.completed_at` for the "cooked" chip.
- **PRD-111** — `plan_entries` + `plan_slots` schema; `addPlanEntry` / `removePlanEntry` / `reorderSlot` / `addCustomSlot` services. This PRD wraps them in a tRPC router. **Amendments required:**
  - **(a)** PRD-111's `plan.ts` service gains `updateSlot(slug, { name?, displayOrder? })` and `deleteSlot(slug)` (rejects `is_default=1` with `CannotDeleteDefault`; rejects `SlotInUse` when any `plan_entries` row references the slug).
  - **(b)** PRD-111's `addCustomSlot(slug, name)` is renamed `addSlot` for consistency with the other two; the old name remains as an alias for backward-compat at the impl phase.
- **PRD-118** — `app-food` manifest; new route + sidebar entry added.
- **PRD-119** — `recipes` query side (recipe picker fetches via `food.recipes.list`).
- **PRD-124** — `recipes.hero_image_path` column read into `PlanEntryRow.heroImagePath`. Client composes the card-thumbnail URL using PRD-124's derived-thumbnail naming (e.g. `hero-card.webp`).
- **PRD-144** — consumer of "Mark cooked" button. Cook modal is owned there.
