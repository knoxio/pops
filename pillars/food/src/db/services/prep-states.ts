import { eq } from 'drizzle-orm';

import { assertValidSlug } from '../../domain/slug.js';
import { PrepStateNotFoundError } from '../errors.js';
import { prepStates, type PrepStateRow } from '../schema.js';
import {
  assertSlugAvailable,
  expectRow,
  type FoodDb,
  recordSlug,
  unregisterSlug,
} from './internal.js';

export interface CreatePrepStateInput {
  name: string;
  slug: string;
}

export function createPrepState(db: FoodDb, input: CreatePrepStateInput): PrepStateRow {
  assertValidSlug(input.slug);
  return db.transaction((tx) => {
    assertSlugAvailable(tx, input.slug);
    const inserted = tx
      .insert(prepStates)
      .values({ name: input.name, slug: input.slug })
      .returning()
      .all();
    const row = expectRow(inserted, 'createPrepState');
    recordSlug(tx, row.slug, 'prep_state', row.id);
    return row;
  });
}

export function deletePrepState(db: FoodDb, id: number): void {
  db.transaction((tx) => {
    const existing = tx
      .select({ slug: prepStates.slug })
      .from(prepStates)
      .where(eq(prepStates.id, id))
      .all();
    const row = existing[0];
    if (row === undefined) return;
    tx.delete(prepStates).where(eq(prepStates.id, id)).run();
    unregisterSlug(tx, row.slug);
  });
}

export function listPrepStates(db: FoodDb): PrepStateRow[] {
  return db.select().from(prepStates).orderBy(prepStates.id).all();
}

/**
 * Return a single prep state row by id. Throws `PrepStateNotFoundError`
 * when no row matches — callers in the router layer map the typed error
 * onto the appropriate REST status.
 */
export function getPrepState(db: FoodDb, id: number): PrepStateRow {
  const row = db.select().from(prepStates).where(eq(prepStates.id, id)).get();
  if (row === undefined) {
    throw new PrepStateNotFoundError(id);
  }
  return row;
}
