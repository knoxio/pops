/**
 * Boot-time backfill from the legacy shared `pops.db` into the cerebrum
 * pillar's `cerebrum.db`.
 *
 * After the theme-13 cerebrum PR4 wave, every cerebrum-owned table
 * except `nudge_log` writes directly to `cerebrum.db`. The engrams
 * (PRD-179), plexus (PRD-180), glia (PRD-181), and conversations
 * (PRD-182) entries have been retired from the backfill — their PR3
 * writer cutovers were verified in prod, so no further rows can land
 * on the shared `pops.db` for those tables. The remaining bridges are
 * `nudge_log` (until Track M5 / PRD-149 flips the nudges writer) and
 * `embeddings` (PRD-076 / theme-13 wave-5 — the slice scaffold landed
 * here, hot-path writer cutover follows in a subsequent PR).
 *
 * Subsequent boots find the cerebrum copy already populated and become
 * a no-op via the `WHERE NOT EXISTS (...)` existence filter.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Partial failures
 * leave the cerebrum copy partially populated; the next deploy retries
 * and the idempotent filter picks up only the still-missing rows.
 *
 * Mirrors `backfill-finance-from-shared.ts` / `backfill-media-from-
 * shared.ts`.
 */
import type Database from 'better-sqlite3';

import type { OpenedCerebrumDb } from '@pops/cerebrum-db';

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
   * covers tables with a surrogate PK; multiple entries express a
   * composite key on junction tables (e.g. `conversation_context`)
   * where row identity is the tuple, not a single column.
   */
  readonly idColumns: readonly [string, ...string[]];
}

const TABLE_COPIES: readonly TableCopy[] = [
  {
    table: 'nudge_log',
    idColumns: ['id'],
    columns: [
      'id',
      'type',
      'title',
      'body',
      'engram_ids',
      'priority',
      'status',
      'created_at',
      'expires_at',
      'acted_at',
      'action_type',
      'action_label',
      'action_params',
    ],
  },
  {
    table: 'embeddings',
    /**
     * `id` is intentionally omitted from the column list. The shared
     * pops.db assigns integer autoincrement IDs that may collide with
     * IDs the cerebrum copy has already assigned via its own
     * autoincrement sequence — copying the PK across would corrupt the
     * sequence and risk INSERT failures that abort the whole batch.
     *
     * The trade-off: the cerebrum `embeddings.id` no longer matches
     * the shared `embeddings_vec.rowid` after the copy. That's
     * acceptable here because the companion `embeddings_vec` virtual
     * table is NOT copied by this backfill (vector blobs stay on the
     * shared pops.db until writer cutover) — the next-PR writer
     * migration rebuilds `embeddings_vec` on cerebrum.db from fresh
     * embedding requests, keyed against the new IDs.
     *
     * The existence filter dedupes on
     * (source_type, source_id, chunk_index), which is the natural
     * business key per the `uq_embeddings_source_chunk` unique index.
     */
    idColumns: ['source_type', 'source_id', 'chunk_index'],
    columns: [
      'source_type',
      'source_id',
      'chunk_index',
      'content_hash',
      'content_preview',
      'model',
      'dimensions',
      'created_at',
    ],
  },
];

function tryCopyTable(raw: Database.Database, copy: TableCopy): void {
  try {
    const hasTable = raw
      .prepare(`SELECT 1 FROM pops.sqlite_master WHERE type='table' AND name='${copy.table}'`)
      .get();
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
    console.warn(`[db] Cerebrum backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Copy every cerebrum-owned table's rows from `pops.db` into
 * `cerebrum.db`, idempotent against re-runs.
 *
 * Caller is responsible for supplying the cerebrum handle (so this
 * module stays decoupled from the lazy singleton in
 * `db/cerebrum-handle.ts`). Production wiring passes the result of
 * `getCerebrumDrizzle()` after the eager-open block; tests pass an
 * in-memory handle with a tmpdir copy of the shared DB pre-populated.
 */
export function backfillCerebrumFromShared(cerebrum: OpenedCerebrumDb, sharedPath: string): void {
  try {
    cerebrum.raw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(cerebrum.raw, copy);
    } finally {
      cerebrum.raw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Cerebrum backfill ATTACH failed (non-fatal):', err);
  }
}
