/**
 * Read services for the `prep_states` table.
 *
 * Phase 1 PR 1 ships only the list + get pair — the create/delete
 * mutations stay in `@pops/app-food-db` for now because they pull in the
 * slug registry + transaction helpers that haven't been extracted yet.
 * The next slice PR widens this surface once those helpers move.
 */
import { eq } from 'drizzle-orm';

import { PrepStateNotFoundError } from '../errors.js';
import { type PrepStateRow } from '../row-types.js';
import { prepStates } from '../schema.js';

import type { FoodDb } from './internal.js';

/**
 * Return every prep state row.
 *
 * Stable ordering is by `id` ascending so seeded fixtures appear in
 * insertion order. Callers that need a different sort apply it after
 * the read.
 */
export function listPrepStates(db: FoodDb): PrepStateRow[] {
  return db.select().from(prepStates).orderBy(prepStates.id).all();
}

/**
 * Return a single prep state row by primary key. Throws
 * `PrepStateNotFoundError` when no row matches.
 */
export function getPrepState(db: FoodDb, id: number): PrepStateRow {
  const row = db.select().from(prepStates).where(eq(prepStates.id, id)).get();
  if (row === undefined) {
    throw new PrepStateNotFoundError(id);
  }
  return row;
}
