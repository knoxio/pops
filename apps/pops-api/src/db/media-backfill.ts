import { resolveSqlitePath } from './sqlite-path.js';

/**
 * Boot-time backfill from the legacy shared `pops.db` into the media
 * pillar's `media.db`.
 *
 * Each slice cutover (Phase 2 PR 3 shelf-impressions, PRD-166 tv-shows, …)
 * flips its handle to `getMediaDrizzle()`. The first deploy after each
 * cutover needs to carry the existing rows from the shared DB across
 * before any reads come from the new file. Subsequent boots find the
 * media copy already populated and become a no-op via the
 * `WHERE id NOT IN (...)` existence filter on every table.
 *
 * No FK relationships exist between the listed media tables, so order
 * is independent — but each entry is wrapped in `tryCopyTable` so a
 * missing source table (post-PR-4 drop scenario, or a stale on-disk
 * pops.db) doesn't bring the whole backfill down. Failures are logged
 * + swallowed; the remaining tables still attempt.
 *
 * Non-fatal: ATTACH or INSERT failures are logged and swallowed so a
 * stale on-disk pops.db never bricks the boot path. Failures here
 * leave the media copy partially populated for that boot; the next
 * deploy retries and the idempotent filter picks up only the
 * still-missing rows.
 *
 * Mirrors `./backfill-finance-from-shared.ts`.
 */
import type Database from 'better-sqlite3';

interface TableCopy {
  readonly table: string;
  /** Explicit column list keeps the backfill robust against a stale
   * on-disk pops.db that already widened or narrowed since the boot
   * image was built. */
  readonly columns: readonly string[];
  /** Identifier column used in the existence filter. */
  readonly idColumn: string;
}

const TABLE_COPIES: readonly TableCopy[] = [
  {
    table: 'shelf_impressions',
    idColumn: 'id',
    columns: ['id', 'shelf_id', 'shown_at'],
  },
  {
    table: 'tv_shows',
    idColumn: 'id',
    columns: [
      'id',
      'tvdb_id',
      'name',
      'original_name',
      'overview',
      'first_air_date',
      'last_air_date',
      'status',
      'original_language',
      'number_of_seasons',
      'number_of_episodes',
      'episode_run_time',
      'poster_path',
      'backdrop_path',
      'logo_path',
      'poster_override_path',
      'discover_rating_key',
      'vote_average',
      'vote_count',
      'genres',
      'networks',
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
    raw.exec(`
      INSERT INTO ${copy.table} (${cols})
      SELECT ${cols}
      FROM pops.${copy.table}
      WHERE ${copy.idColumn} NOT IN (SELECT ${copy.idColumn} FROM ${copy.table})
    `);
  } catch (err) {
    console.warn(`[db] Media backfill of ${copy.table} failed (non-fatal):`, err);
  }
}

/**
 * Run the idempotent backfill against the open media SQLite handle. The
 * caller resolves the raw better-sqlite3 handle (typically
 * `getMediaDrizzle()`'s sibling `OpenedMediaDb.raw`) and passes it in so
 * this module stays decoupled from the singleton in
 * `./media-db-handle.ts`.
 */
export function backfillMediaFromShared(mediaRaw: Database.Database | null): void {
  if (!mediaRaw) return;
  const sharedPath = resolveSqlitePath();
  try {
    mediaRaw.prepare('ATTACH DATABASE ? AS pops').run(sharedPath);
    try {
      for (const copy of TABLE_COPIES) tryCopyTable(mediaRaw, copy);
    } finally {
      mediaRaw.exec('DETACH DATABASE pops');
    }
  } catch (err) {
    console.warn('[db] Media backfill ATTACH failed (non-fatal):', err);
  }
}
