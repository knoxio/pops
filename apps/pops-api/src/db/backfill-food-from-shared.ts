/**
 * Boot-time backfill from the legacy shared `pops.db` into the food
 * pillar's `food.db` for the Theme-13 Wave-5 PR4 slices:
 *
 *   - conversions slice: `unit_conversions`, `ingredient_weights`
 *     (landed in `0059_food_conversions.sql`).
 *   - ingredients slice: `ingredients`, `ingredient_variants`,
 *     `ingredient_aliases`, `ingredient_tags`, and the food-owned
 *     `kind IN ('ingredient','prep_state')` rows of `slug_registry`
 *     (landed in `0060_food_ingredient_tags.sql`).
 *
 * Phase context: the earlier prep_states slice finished its PR4 writer
 * cutover so the original food backfill bridge was retired. This module
 * brings the bridge back for the conversions + ingredients clusters —
 * the writer flips land in the same PRs, and the boot bridge carries
 * any rows still on the shared pops.db across so reads through
 * `getFoodDrizzle()` see the full vocabulary on first deploy. Each
 * TABLE_COPIES entry retires after its writer cutover is verified in
 * prod and the shared `pops.db` stops receiving new rows.
 *
 * The slug_registry copy is split-aware: only `kind='ingredient'` and
 * `kind='prep_state'` rows land on food.db. `kind='recipe'` rows still
 * belong on the legacy shared pops.db (recipes router has not cut over
 * yet); `kind='prep_state'` rows are already on food.db from the earlier
 * PR4 round, so a `WHERE kind = 'prep_state'` copy is a no-op in steady
 * state but is included here for completeness and to keep the bridge
 * idempotent even when a stale pops.db still holds prep_state rows from
 * before its own retirement.
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
  /**
   * Optional WHERE filter applied to the source rows. Used by the
   * `slug_registry` entry to scope the copy to the food-owned kinds
   * (`ingredient`, `prep_state`) — `kind='recipe'` rows still belong on
   * the legacy pops.db until the recipes writer cuts over.
   */
  readonly sourceFilter?: string;
}

const FOOD_OWNED_SLUG_KINDS = ['ingredient', 'prep_state'];

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
  {
    /**
     * `id` is preserved so the dependent `ingredient_variants`,
     * `ingredient_aliases`, `ingredient_tags`, and slug_registry rows
     * carry the same FK target across without remapping. The food.db is
     * freshly empty at first backfill; the SQLite autoincrement sequence
     * picks up from `MAX(id)+1` after the copy. Dedupe on `id` keeps
     * subsequent boots idempotent.
     */
    table: 'ingredients',
    idColumns: ['id'],
    columns: [
      'id',
      'parent_id',
      'name',
      'slug',
      'default_unit',
      'density_g_per_ml',
      'notes',
      'created_at',
    ],
  },
  {
    table: 'ingredient_variants',
    idColumns: ['id'],
    columns: [
      'id',
      'ingredient_id',
      'name',
      'slug',
      'default_unit',
      'package_size_g',
      'notes',
      'default_shelf_life_days_fridge',
      'default_shelf_life_days_freezer',
      'created_at',
    ],
  },
  {
    /**
     * `ingredient_aliases` rows reference either an ingredient or a
     * variant (XOR enforced by `ck_aliases_xor_target`). Dedupe on `id`
     * — the partial UNIQUEs on `(alias, ingredient_id)` /
     * `(alias, variant_id)` keep business-key uniqueness intact across
     * the join even though we don't match on it here.
     */
    table: 'ingredient_aliases',
    idColumns: ['id'],
    columns: ['id', 'ingredient_id', 'variant_id', 'alias', 'source', 'created_at'],
  },
  {
    /**
     * `ingredient_tags` is a composite-PK junction table — no surrogate
     * `id`. Dedupe on the natural key `(ingredient_id, tag)`.
     */
    table: 'ingredient_tags',
    idColumns: ['ingredient_id', 'tag'],
    columns: ['ingredient_id', 'tag', 'created_at'],
  },
  {
    /**
     * `slug_registry` is partitioned across pillars by `kind`:
     *   - `kind='ingredient'` rows now belong on food.db (this PR cutover)
     *   - `kind='prep_state'` rows already belong on food.db (earlier PR4)
     *   - `kind='recipe'` rows still belong on the legacy pops.db.
     * Scope the copy to the food-owned kinds so the bridge never drags
     * recipe rows over and creates a phantom duplicate when the recipes
     * writer eventually cuts over.
     *
     * Dedupe on `slug` (the PK on both sides) — natural identity, no
     * surrogate to collide on.
     */
    table: 'slug_registry',
    idColumns: ['slug'],
    columns: ['slug', 'kind', 'target_id', 'created_at'],
    sourceFilter: `kind IN ('${FOOD_OWNED_SLUG_KINDS.join("','")}')`,
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
    const sourceWhere = copy.sourceFilter !== undefined ? `WHERE ${copy.sourceFilter}` : '';
    raw.exec(`
      INSERT INTO ${copy.table} (${cols})
      SELECT ${cols}
      FROM pops.${copy.table}
      ${sourceWhere}
      ${copy.sourceFilter !== undefined ? 'AND' : 'WHERE'} NOT EXISTS (
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
