/**
 * Seed step — prep_states.
 *
 * Calls `createPrepState` for each canonical entry so the slug_registry row
 * is recorded via the service's transaction.
 */
import { createPrepState } from '../db/services/prep-states.js';
import { PREP_STATE_FIXTURES } from './data-prep-states.js';

import type { FoodDb } from '../db/services/internal.js';
import type { SeedContext } from './types.js';

export function seedPrepStates(db: FoodDb, ctx: SeedContext): number {
  for (const fixture of PREP_STATE_FIXTURES) {
    const row = createPrepState(db, fixture);
    ctx.prepStateIdBySlug.set(row.slug, row.id);
  }
  return PREP_STATE_FIXTURES.length;
}
