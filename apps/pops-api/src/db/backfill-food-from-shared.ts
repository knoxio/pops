/**
 * Boot-time backfill from the legacy shared `pops.db` into the food
 * pillar's `food.db` for the Theme-13 Wave-5 PR4 conversions slice:
 * `unit_conversions` and `ingredient_weights`.
 *
 * Phase context: the earlier food slice (prep_states + the
 * `kind='prep_state'` rows of slug_registry) finished its PR4 writer
 * cutover in earlier rounds, so the original food backfill bridge was
 * retired. This module brings the bridge back for the new tables landing
 * in `0059_food_conversions.sql`. Each TABLE_COPIES entry retires after
 * its writer cutover is verified in prod and the shared `pops.db` stops
 * receiving new rows.
 *
 * Subsequent boots find the food copy already populated and become a
 * no-op via the `WHERE NOT EXISTS (...)` existence filter.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Partial failures
 * leave the food copy partially populated; the next deploy retries
 * and the idempotent filter picks up only the still-missing rows.
 *
 * Mirrors `backfill-media-from-shared.ts`,
 * `backfill-cerebrum-from-shared.ts`, and `backfill-core-from-shared.ts`.
 */
import type Database from 'better-sqlite3';

import type { OpenedFoodDb } from '@pops/food-db';

interface TableCopy {
  readonly table: string;
  /**
   * Explicit column list keeps the backfill robust against a stale
   * on-disk pops.db that already widened or narrowed since the boot
   * image was built.
   */
  readonly columns: readonly string[];
  /**
   * Identifier column(s) used in the existence filter. A single entry
   * covers tables with a surrogate or natural single-column PK; multiple
   * entries express a composite business-key tuple.
   */
  readonly idColumns: readonly [string, ...string[]];
}

const TABLE_COPIES: readonly TableCopy[] = [
  {
    /**
     * `unit_conversions` is identified by its natural business key
     * `(from_unit, to_unit)` — enforced by `uq_unit_conversions_from_to`
     * on both sides. Copying on the natural key keeps row identity
     * stable while letting each side own its own surrogate `id` space,
     * which avoids autoincrement collisions if the food copy already
     * inserted user rows before the bridge ran.
     */
    table: 'unit_conversions',
    idColumns: ['from_unit', 'to_unit'],
    columns: ['from_unit', 'to_unit', 'ratio', 'notes', 'is_seeded', 'created_at'],
  },
  {
    /**
     * `ingredient_weights` is identified by its natural business key
     * `(ingredient_id, variant_id, unit)` — enforced by the two partial
     * UNIQUE indexes `uq_ingredient_weights_with_variant` /
     * `uq_ingredient_weights_any_variant` on both sides. The existence
     * filter uses SQLite's `IS` operator (not `=`) so a NULL `variant_id`
     * on both sides correctly compares as equal — without that, the
     * null-variant rows would re-copy on every boot.
     *
     * `ingredient_id` and `variant_id` are cross-pillar soft pointers
     * into `pops.db.ingredients` / `pops.db.ingredient_variants` — see
     * the FK note in `0059_food_conversions.sql`. The migration omits
     * the SQLite FK at table-creation time so the copy lands without
     * tripping the cross-DB constraint.
     */
    table: 'ingredient_weights',
    idColumns: ['ingredient_id', 'variant_id', 'unit'],
    columns: ['ingredient_id', 'variant_id', 'unit', 'grams', 'notes', 'is_seeded', 'created_at'],
  },
];

function buildKeyMatch(table: string, idColumns: readonly string[]): string {
  return idColumns.map((col) => `(target.${col} IS pops.${table}.${col})`).join(' AND ');
}

function tryCopyTable(raw: Database.Database, copy: TableCopy): void {
  try {
    const hasTable = raw
      .prepare(`SELECT 1 FROM pops.sqlite_master WHERE type='table' AND name=?`)
      .get(copy.table);
    if (!hasTable) return;
    const cols = copy.columns.join(', ');
    const keyMatch = buildKeyMatch(copy.table, copy.idColumns);
    raw.exec(`
      INSERT INTO ${copy.table} (${cols})
      SELECT ${cols}
      FROM pops.${copy.table}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${copy.table} AS target WHERE ${keyMatch}
      )
    `);
  } catch (err) {
    console.warn(`[db] Food backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Copy every food-owned PR4 table's rows from `pops.db` into `food.db`,
 * idempotent against re-runs. Caller supplies the open food handle (so
 * this module stays decoupled from the lazy singleton in
 * `db/food-handle.ts`) and the path to the legacy shared pops.db.
 */
export function backfillFoodFromShared(food: OpenedFoodDb, sharedPath: string): void {
  try {
    food.raw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(food.raw, copy);
    } finally {
      food.raw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Food backfill ATTACH failed (non-fatal):', err);
  }
}
