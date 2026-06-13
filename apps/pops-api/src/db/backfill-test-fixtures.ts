/**
 * SQL fixtures for the per-pillar backfill suites.
 *
 * Inlined here (rather than reading the canonical drizzle-migration
 * files) so the tests stay robust against the eventual phase-2-PR4
 * deletion of those shared-journal copies. Each DDL matches the
 * byte-identical migration that lands in both
 * `apps/pops-api/src/db/drizzle-migrations/` and
 * `packages/<id>-db/migrations/`.
 *
 * Split across per-pillar siblings (`backfill-test-fixtures-media.ts`)
 * so each file stays under the 200-line lint cap. The core and finance
 * pillars' fixtures siblings were retired alongside their PR4 FULL
 * EXIT drops — every core- and finance-owned table writes directly to
 * its pillar DB. This barrel keeps the existing import surface stable
 * for the remaining pillars.
 */
export {
  DISMISSED_DISCOVER_TABLE_SQL,
  MOVIES_TABLE_SQL,
  SHELF_IMPRESSIONS_TABLE_SQL,
  TV_SHOWS_TABLE_SQL,
  WATCH_HISTORY_TABLE_SQL,
  WATCHLIST_TABLE_SQL,
} from './backfill-test-fixtures-media.js';
