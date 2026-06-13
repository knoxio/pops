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
 * `nudge_log` (until Track M5 / PRD-149 flips the nudges writer),
 * `embeddings` (PRD-076 / theme-13 wave-5 — slice already cut over),
 * and the debrief slice (`debrief_sessions`, `debrief_results`,
 * `debrief_status`) — Theme-13 Wave 5 cascade per PR #3191's MEDIA
 * exit audit. The shared `pops.db` copies of the debrief tables stay
 * in place until prod verification, then the bridge entries retire in
 * the same pattern as the other slices.
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
  {
    /**
     * `id` is preserved so the dependent `debrief_results.session_id`
     * foreign-key references continue to resolve after the bridge runs.
     * The cerebrum.db is freshly empty on first boot, so there is no
     * autoincrement collision risk; the SQLite sequence picks up from
     * `MAX(id)+1` after the copy. Dedupe on `id` keeps subsequent boots
     * idempotent.
     */
    table: 'debrief_sessions',
    idColumns: ['id'],
    columns: ['id', 'watch_history_id', 'media_type', 'media_id', 'status', 'created_at'],
  },
  {
    /**
     * Dedupe on `id` for the same reason as `debrief_sessions` — the
     * row's `session_id` is the load-bearing identity, copying it across
     * keeps history intact for any in-flight debrief that already had
     * partial results on the shared pops.db.
     */
    table: 'debrief_results',
    idColumns: ['id'],
    columns: ['id', 'session_id', 'dimension_id', 'comparison_id', 'created_at'],
  },
  {
    /**
     * Composite natural key from `debrief_status_media_dimension_idx`
     * (UNIQUE on `(media_type, media_id, dimension_id)`) — re-runs only
     * insert tuples the cerebrum copy is missing. `debriefed` /
     * `dismissed` flags follow whatever the shared row had at backfill
     * time; subsequent writer activity on cerebrum.db wins.
     */
    table: 'debrief_status',
    idColumns: ['media_type', 'media_id', 'dimension_id'],
    columns: [
      'media_type',
      'media_id',
      'dimension_id',
      'debriefed',
      'dismissed',
      'created_at',
      'updated_at',
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
