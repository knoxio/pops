/**
 * PRD-113 seed step — prep_states.
 *
 * Calls `createPrepState` for each canonical entry so the slug_registry row
 * is recorded via the service's transaction.
 */
import { createPrepState } from '../services/prep-states';
import { PREP_STATE_FIXTURES } from './data-prep-states';

import type { FoodDb } from '../services/internal';
import type { SeedContext } from './types';

export function seedPrepStates(db: FoodDb, ctx: SeedContext): number {
  for (const fixture of PREP_STATE_FIXTURES) {
    const row = createPrepState(db, fixture);
    ctx.prepStateIdBySlug.set(row.slug, row.id);
  }
  return PREP_STATE_FIXTURES.length;
}
