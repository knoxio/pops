/**
 * Boot-time backfill from the legacy shared `pops.db` into the food
 * pillar's `food.db`.
 *
 * Phase 2 PR 3 of the food pillar flips the prep_states slice reads
 * (`food.prepStates.list`) to the food handle. The first deploy after
 * PR 3 needs to carry the existing prep_states rows from the shared DB
 * across before any reads come from the new file. Subsequent boots
 * find the food copy already populated and become a no-op via the
 * `WHERE id NOT IN (...)` existence filter.
 *
 * The current scope covers `prep_states` plus the prep-state subset of
 * `slug_registry` (filtered to `kind='prep_state'`) so the slug
 * lookups behind the cutover keep resolving. Other food tables —
 * ingredients + ingredient_variants + ingredient_aliases + the rest of
 * `slug_registry` + recipes + recipe_versions + plan slices — are
 * added to the table-copies list when their cutovers land. The
 * `prep_states` table has no FK references to other food tables so
 * order is trivial for this PR.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Partial failures
 * leave the food copy partially populated; the next deploy retries
 * and the idempotent filter picks up only the still-missing rows.
 *
 * Mirrors `backfill-inventory-from-shared.ts` / `backfill-finance-from-
 * shared.ts` / `backfill-media-from-shared.ts` / `backfill-cerebrum-
 * from-shared.ts`.
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
  /** Identifier column used in the existence filter. */
  readonly idColumn: string;
  /**
   * Optional WHERE filter on the source side, evaluated against the
   * attached `pops.<table>`. Used by the slug_registry copy in this
   * slice so only `kind = 'prep_state'` rows come across — the other
   * kinds (`ingredient`, `recipe`) still belong to the legacy shared
   * registry until their slices migrate.
   */
  readonly sourceWhere?: string;
}

const TABLE_COPIES: readonly TableCopy[] = [
  {
    table: 'prep_states',
    idColumn: 'id',
    columns: ['id', 'name', 'slug'],
  },
  {
    table: 'slug_registry',
    idColumn: 'slug',
    columns: ['slug', 'kind', 'target_id', 'created_at'],
    sourceWhere: "kind = 'prep_state'",
  },
];

function tryCopyTable(raw: Database.Database, copy: TableCopy): void {
  try {
    const hasTable = raw
      .prepare(`SELECT 1 FROM pops.sqlite_master WHERE type='table' AND name='${copy.table}'`)
      .get();
    if (!hasTable) return;
    const cols = copy.columns.join(', ');
    const sourceWhere = copy.sourceWhere ? ` AND ${copy.sourceWhere}` : '';
    raw.exec(`
      INSERT INTO ${copy.table} (${cols})
      SELECT ${cols}
      FROM pops.${copy.table}
      WHERE ${copy.idColumn} NOT IN (SELECT ${copy.idColumn} FROM ${copy.table})${sourceWhere}
    `);
  } catch (err) {
    console.warn(`[db] Food backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Copy rows for each table currently listed in `TABLE_COPIES`
 * (`prep_states` plus the `kind='prep_state'` slice of `slug_registry`
 * as of Phase 2 PR 3) from `pops.db` into `food.db`, idempotent against
 * re-runs. Subsequent slice cutovers append to `TABLE_COPIES` so the
 * coverage grows with each PR rather than landing all at once.
 *
 * Caller is responsible for supplying the food handle (so this module
 * stays decoupled from the lazy singleton in `db/food-handle.ts`).
 * Production wiring passes the result of `getFoodDrizzle()` after the
 * eager-open block; tests pass an in-memory handle with a tmpdir copy
 * of the shared DB pre-populated.
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
