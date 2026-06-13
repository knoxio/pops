/**
 * Boot-time backfill from the legacy shared `pops.db` into the core
 * pillar's `core.db` for the three tables PRD-186 PR4 lands in core-db:
 * `ai_model_pricing`, `sync_job_results`, and `ai_usage`.
 *
 * Phase context: PR4 establishes the per-pillar table home for these
 * tables (`packages/core-db/migrations/0059..0061_*.sql`) ahead of the
 * hot-path writer cutover that flips `inference-pricing.ts`,
 * `inference-middleware.ts`, and `jobs/sync-results.ts` from
 * `getDrizzle()` to `getCoreDrizzle()` in the next PR. Until that cutover
 * lands, writers still target `pops.db` — so this backfill carries the
 * existing rows across on every boot so the new core table isn't a ghost.
 * After the cutover lands and is verified in prod, the corresponding
 * `TABLE_COPIES` entry is retired (matching the cerebrum/finance/media
 * pattern documented in `backfill-cerebrum-from-shared.ts`).
 *
 * Subsequent boots find the core copy already populated and become a
 * no-op via the `WHERE NOT EXISTS (...)` existence filter.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Partial failures
 * leave the core copy partially populated; the next deploy retries and
 * the idempotent filter picks up only the still-missing rows.
 *
 * Mirrors `backfill-cerebrum-from-shared.ts` /
 * `backfill-finance-from-shared.ts` / `backfill-media-from-shared.ts`.
 */
import type Database from 'better-sqlite3';

import type { OpenedCoreDb } from '@pops/core-db';

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
   * entries express the business-key tuple for tables whose PK is an
   * autoincrement integer (e.g. `ai_model_pricing` keyed on
   * `(provider_id, model_id)`).
   */
  readonly idColumns: readonly [string, ...string[]];
}

const TABLE_COPIES: readonly TableCopy[] = [
  {
    table: 'ai_model_pricing',
    idColumns: ['provider_id', 'model_id'],
    columns: [
      'provider_id',
      'model_id',
      'display_name',
      'input_cost_per_mtok',
      'output_cost_per_mtok',
      'context_window',
      'is_default',
      'created_at',
      'updated_at',
    ],
  },
  {
    table: 'sync_job_results',
    idColumns: ['id'],
    columns: [
      'id',
      'job_type',
      'status',
      'started_at',
      'completed_at',
      'duration_ms',
      'progress',
      'result',
      'error',
      'created_at',
    ],
  },
  {
    table: 'ai_usage',
    idColumns: ['id'],
    columns: [
      'id',
      'description',
      'entity_name',
      'category',
      'input_tokens',
      'output_tokens',
      'cost_usd',
      'cached',
      'import_batch_id',
      'created_at',
    ],
  },
];

function tryCopyTable(raw: Database.Database, copy: TableCopy): void {
  try {
    const hasTable = raw
      .prepare(`SELECT 1 FROM pops.sqlite_master WHERE type='table' AND name=?`)
      .get(copy.table);
    if (!hasTable) return;
    const cols = copy.columns.join(', ');
    const keyMatch = copy.idColumns
      .map((col) => `target.${col} = pops.${copy.table}.${col}`)
      .join(' AND ');
    raw.exec(`
      INSERT INTO ${copy.table} (${cols})
      SELECT ${cols}
      FROM pops.${copy.table}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${copy.table} AS target WHERE ${keyMatch}
      )
    `);
  } catch (err) {
    console.warn(`[db] Core backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Copy every PRD-186-PR4-owned table's rows from `pops.db` into
 * `core.db`, idempotent against re-runs. Caller supplies the open core
 * handle (so this module stays decoupled from the singleton in
 * `db.ts`) and the path to the legacy shared pops.db.
 */
export function backfillCoreFromShared(core: OpenedCoreDb, sharedPath: string): void {
  try {
    core.raw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(core.raw, copy);
    } finally {
      core.raw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Core backfill ATTACH failed (non-fatal):', err);
  }
}
