/**
 * Prep state services — PRD-106.
 *
 * Prep states participate in `slug_registry` (kind='prep_state'). Each
 * mutation that touches the registry does so in the same transaction as
 * the parent row so partial-failure rollbacks leave both consistent.
 */
import { eq } from 'drizzle-orm';

import { prepStates, type PrepStateRow } from '../schema.js';
import { assertValidSlug } from '../slug.js';
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
  return db.select().from(prepStates).all();
}
