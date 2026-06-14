/**
 * Boot-time backfill from the legacy shared `pops.db` into the media
 * pillar's `media.db` for the Theme-13 Wave-5 PR4 tables: `media_scores`,
 * `rotation_log`, `rotation_sources`, `rotation_candidates`, and
 * `rotation_exclusions`.
 *
 * Phase context: the earlier media slices (movies / tv_shows / seasons /
 * episodes / watchlist / watch_history / dismissed_discover /
 * shelf_impressions / comparison_staleness) finished their PR4 writer
 * cutovers in earlier rounds, so the original `media-backfill.ts` was
 * retired. This module brings the bridge back for the new tables landing
 * in `0030_media_scores_baseline.sql` and `0031_rotation_baseline.sql`.
 * Each TABLE_COPIES entry retires after its writer cutover is verified in
 * prod and the shared `pops.db` stops receiving new rows.
 *
 * Subsequent boots find the media copy already populated and become a
 * no-op via the `WHERE NOT EXISTS (...)` existence filter.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Partial failures
 * leave the media copy partially populated; the next deploy retries
 * and the idempotent filter picks up only the still-missing rows.
 *
 * Mirrors `backfill-cerebrum-from-shared.ts` and
 * `backfill-core-from-shared.ts`.
 */
import type Database from 'better-sqlite3';

import type { OpenedMediaDb } from '@pops/media-db';

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
    table: 'media_scores',
    /**
     * `id` is intentionally omitted from the column list. The shared
     * pops.db assigns integer autoincrement IDs that may collide with
     * IDs the media copy has already assigned via its own autoincrement
     * sequence. The natural business key
     * (media_type, media_id, dimension_id) is enforced as
     * `idx_media_scores_unique` on both sides — copying on that tuple
     * keeps row identity stable while letting each side own its own
     * surrogate PK space.
     */
    idColumns: ['media_type', 'media_id', 'dimension_id'],
    columns: [
      'media_type',
      'media_id',
      'dimension_id',
      'score',
      'comparison_count',
      'excluded',
      'updated_at',
    ],
  },
  {
    table: 'rotation_log',
    idColumns: ['id'],
    columns: [
      'id',
      'executed_at',
      'movies_marked_leaving',
      'movies_removed',
      'movies_added',
      'removals_failed',
      'free_space_gb',
      'target_free_gb',
      'skipped_reason',
      'details',
    ],
  },
  {
    table: 'rotation_sources',
    idColumns: ['id'],
    columns: [
      'id',
      'type',
      'name',
      'priority',
      'enabled',
      'config',
      'last_synced_at',
      'sync_interval_hours',
      'created_at',
    ],
  },
  {
    table: 'rotation_candidates',
    /**
     * `tmdb_id` is unique per `idx_rotation_candidates_tmdb_id`; using
     * the natural key here keeps rows aligned across both DBs without
     * caring about the surrogate `id`. `source_id` references
     * `rotation_sources(id)` — `rotation_sources` is copied first in
     * this same ATTACH transaction so the FK target exists by the time
     * the candidate rows land.
     */
    idColumns: ['tmdb_id'],
    columns: [
      'source_id',
      'tmdb_id',
      'title',
      'year',
      'rating',
      'poster_path',
      'status',
      'discovered_at',
    ],
  },
  {
    table: 'rotation_exclusions',
    idColumns: ['tmdb_id'],
    columns: ['tmdb_id', 'title', 'reason', 'excluded_at'],
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
    console.warn(`[db] Media backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Copy every media-owned table's rows from `pops.db` into `media.db`,
 * idempotent against re-runs. Caller supplies the open media handle (so
 * this module stays decoupled from the lazy singleton in
 * `db/media-db-handle.ts`) and the path to the legacy shared pops.db.
 */
export function backfillMediaFromShared(media: OpenedMediaDb, sharedPath: string): void {
  try {
    media.raw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(media.raw, copy);
    } finally {
      media.raw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Media backfill ATTACH failed (non-fatal):', err);
  }
}
