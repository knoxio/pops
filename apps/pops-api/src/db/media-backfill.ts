import { resolveSqlitePath } from './sqlite-path.js';

/**
 * Boot-time backfill from the legacy shared `pops.db` into the media
 * pillar's `media.db`.
 *
 * Each slice cutover (Phase 2 PR 3 shelf-impressions, PRD-166 tv-shows,
 * PRD-168 watch history, …) flips its handle to `getMediaDrizzle()`.
 * The first deploy after each cutover needs to carry the existing rows
 * from the shared DB across before any reads come from the new file.
 * Subsequent boots find the media copy already populated and become a
 * no-op via the `WHERE id NOT IN (...)` existence filter on every
 * table.
 *
 * PRD-165 movies finished its writer cutover in PR 3 (#3018) — every
 * write site now lands on `getMediaDrizzle()` directly, so the boot
 * bridge no longer has anything to carry forward and the `movies` entry
 * has been retired from `TABLE_COPIES`. Depends on PR 3 being deployed
 * to prod first; otherwise late-arriving rows on `pops.db.movies` would
 * be stranded.
 *
 * PRD-170 shelf_impressions has the same story: every read and write of
 * `shelf_impressions` routes through `shelfImpressionsService` on the
 * media pillar handle (Phase 2 PR 3). The boot bridge no longer has a
 * source of new rows to carry across, so the `shelf_impressions` entry
 * is retired here. Same deploy-order constraint as movies — the writer
 * cutover must be live in prod before this drop ships.
 *
 * No FK relationships exist between the listed media tables, so order
 * is independent — but each entry is wrapped in `tryCopyTable` so a
 * missing source table (post-PR-4 drop scenario, or a stale on-disk
 * pops.db) doesn't bring the whole backfill down. Failures are logged
 * + swallowed; the remaining tables still attempt.
 *
 * Insert-only semantics — staleness model: `tryCopyTable` runs
 * `INSERT ... WHERE id NOT IN (SELECT id FROM target)`, so the boot
 * copy is strictly additive. For slices whose writes still target
 * `pops.db` during the read/write split (`watchlist` is the live
 * example as of PRD-167 PR 2), an UPDATE or DELETE applied to
 * `pops.db.<table>` between boots is not reflected in
 * `media.db.<table>`: an updated row keeps its stale fields in the
 * media copy, and a deleted row keeps existing there until a manual
 * intervention or the writer cutover lands. Reads off the media handle
 * therefore lag writes by up to one boot cycle for the in-flight
 * `priority` / `notes` / `plex_rating_key` columns and may
 * temporarily surface entries that have already been deleted on the
 * shared store. The watchlist router's removal flow guards against
 * the deletion-resurrection foot-gun by routing the pre-delete
 * existence check through `getSharedWatchlistEntry` (writes go to the
 * same store as the check). Full read-your-writes consistency lands
 * with PRD-167's writer cutover, at which point this `watchlist`
 * entry collapses into a pure post-cutover seed and the staleness
 * window disappears. Mirrors the precedent set by PRD-168 PR 2 for
 * `watch_history` and PRD-165 PR 3 for `movies`.
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
  {
    table: 'seasons',
    idColumn: 'id',
    columns: [
      'id',
      'tv_show_id',
      'tvdb_id',
      'season_number',
      'name',
      'overview',
      'poster_path',
      'air_date',
      'episode_count',
      'created_at',
    ],
  },
  {
    table: 'episodes',
    idColumn: 'id',
    columns: [
      'id',
      'season_id',
      'tvdb_id',
      'episode_number',
      'name',
      'overview',
      'air_date',
      'still_path',
      'vote_average',
      'runtime',
      'created_at',
    ],
  },
  {
    table: 'watch_history',
    idColumn: 'id',
    columns: ['id', 'media_type', 'media_id', 'watched_at', 'completed', 'blacklisted'],
  },
  {
    table: 'watchlist',
    idColumn: 'id',
    columns: [
      'id',
      'media_type',
      'media_id',
      'priority',
      'notes',
      'added_at',
      'source',
      'plex_rating_key',
    ],
  },
  {
    table: 'dismissed_discover',
    idColumn: 'tmdb_id',
    columns: ['tmdb_id', 'dismissed_at'],
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
