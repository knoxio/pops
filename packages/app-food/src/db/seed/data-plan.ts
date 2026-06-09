/**
 * PRD-113 fixture set — plan slots + plan entries.
 *
 * Plan slots: the default vocabulary (breakfast/lunch/dinner/snack/prep-
 * session). `is_default = 1` so `deleteSlot` refuses them (PRD-111 service
 * invariant).
 *
 * Plan entries: a mix of slotted (Mon-Fri dinners + a Sunday prep-session)
 * and ad-hoc lunches. Dates are anchored to a stable Monday so the seed is
 * deterministic across re-runs.
 */

export interface PlanSlotFixture {
  slug: string;
  name: string;
  displayOrder: number;
  isDefault: 0 | 1;
}

/**
 * Five default slots + one user-added slot so the seed exercises both
 * `is_default = 1` and `is_default = 0` paths.
 */
export const PLAN_SLOT_FIXTURES: readonly PlanSlotFixture[] = [
  { slug: 'breakfast', name: 'Breakfast', displayOrder: 10, isDefault: 1 },
  { slug: 'lunch', name: 'Lunch', displayOrder: 20, isDefault: 1 },
  { slug: 'dinner', name: 'Dinner', displayOrder: 30, isDefault: 1 },
  { slug: 'snack', name: 'Snack', displayOrder: 40, isDefault: 1 },
  { slug: 'prep-session', name: 'Prep session', displayOrder: 50, isDefault: 1 },
  // User-added slot to exercise the `is_default = 0` path (PRD-111 amendment).
  { slug: 'late-night', name: 'Late night', displayOrder: 60, isDefault: 0 },
];

/** Stable Monday anchor (kept as a constant so re-running the seed produces the same dates). */
export const PLAN_WEEK_ANCHOR_MONDAY = '2026-06-15';

/** Adds `offsetDays` to `PLAN_WEEK_ANCHOR_MONDAY`. */
export function planDateForOffset(offsetDays: number): string {
  const base = new Date(`${PLAN_WEEK_ANCHOR_MONDAY}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

export interface PlanEntryFixture {
  /** `offsetDays` from `PLAN_WEEK_ANCHOR_MONDAY`. 0 = Monday, 6 = Sunday. */
  offsetDays: number;
  slot: string;
  recipeSlug: string;
  plannedServings?: number;
  position?: number;
  notes?: string;
}

/**
 * 7 slotted + 2 ad-hoc entries. Two entries on Sunday's prep-session slot
 * exercise the per-slot position ordering.
 */
export const PLAN_ENTRY_FIXTURES: readonly PlanEntryFixture[] = [
  // Slotted dinners across the week
  { offsetDays: 0, slot: 'dinner', recipeSlug: 'smash-burger', plannedServings: 2 },
  { offsetDays: 1, slot: 'dinner', recipeSlug: 'weeknight-pasta', plannedServings: 2 },
  { offsetDays: 2, slot: 'dinner', recipeSlug: 'roast-chicken', plannedServings: 4 },
  // Lunches (some slotted, some ad-hoc-style via the 'snack' slot)
  { offsetDays: 0, slot: 'lunch', recipeSlug: 'breakfast-eggs', plannedServings: 1 },
  { offsetDays: 3, slot: 'lunch', recipeSlug: 'breakfast-eggs', plannedServings: 1 },
  // Ad-hoc-style (snack slot, no time of day pinned)
  { offsetDays: 1, slot: 'snack', recipeSlug: 'breakfast-eggs', plannedServings: 1 },
  { offsetDays: 4, slot: 'snack', recipeSlug: 'breakfast-eggs', plannedServings: 1 },
  // Sunday prep-session with two entries — exercises position 0 and 1
  {
    offsetDays: 6,
    slot: 'prep-session',
    recipeSlug: 'smash-burger',
    plannedServings: 6,
    position: 0,
    notes: 'Batch patties for the week',
  },
  {
    offsetDays: 6,
    slot: 'prep-session',
    recipeSlug: 'roast-chicken',
    plannedServings: 4,
    position: 1,
    notes: 'Roast a whole bird; shred for lunches',
  },
];
