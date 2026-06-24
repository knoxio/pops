import { groupIntoSections, toUtcMidnight } from './view-grouping.js';
import { resolveRecipeSlugs, selectCounts, selectRows } from './view-query.js';

/**
 * Fridge view query (`pillars/food/docs/prds/fridge-view`).
 *
 * Reads `batches` joined to `ingredient_variants` / `ingredients` /
 * `prep_states`, applies the filter inputs, and projects into the
 * `FridgeView` shape (sections by location → ingredient groups →
 * batch rows). The default view excludes empties and soft-deleted rows
 * (`qty_remaining > 0 AND deleted_at IS NULL`).
 *
 * `daysToExpiry` is computed in calendar days at UTC. We don't pull in
 * date-fns server-side — the math is `(expiryUtcMidnight - todayUtcMidnight)
 * / 86_400_000`, which matches `differenceInCalendarDays` semantics for
 * date-only inputs.
 */
import type { FoodDb, FridgeView } from '../../../db/index.js';
import type { FridgeViewInput } from './inputs.js';

export function fridgeView(db: FoodDb, input: FridgeViewInput, now: Date = new Date()): FridgeView {
  const rows = selectRows(db, input, now);
  const recipeSlugByRun = resolveRecipeSlugs(db, rows);
  const sections = groupIntoSections(rows, recipeSlugByRun, toUtcMidnight(now));
  const counts = selectCounts(db, input);
  return { sections, counts };
}
