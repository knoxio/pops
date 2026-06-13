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
 * Split across per-pillar siblings (`backfill-test-fixtures-core.ts`,
 * `-media.ts`, `-finance.ts`) so each file stays under the 200-line
 * lint cap. This barrel keeps the existing import surface stable.
 */
export {
  AI_BUDGETS_TABLE_SQL,
  AI_INFERENCE_DAILY_TABLE_SQL,
  AI_INFERENCE_LOG_TABLE_SQL,
  SERVICE_ACCOUNTS_TABLE_SQL,
  SETTINGS_TABLE_SQL,
} from './backfill-test-fixtures-core.js';
export {
  MOVIES_TABLE_SQL,
  SHELF_IMPRESSIONS_TABLE_SQL,
  TV_SHOWS_TABLE_SQL,
  WATCH_HISTORY_TABLE_SQL,
  WATCHLIST_TABLE_SQL,
} from './backfill-test-fixtures-media.js';
export {
  BUDGETS_TABLE_SQL,
  ENTITIES_TABLE_SQL,
  TAG_VOCABULARY_TABLE_SQL,
  TRANSACTION_CORRECTIONS_TABLE_SQL,
  TRANSACTION_TAG_RULES_TABLE_SQL,
  TRANSACTIONS_TABLE_SQL,
} from './backfill-test-fixtures-finance.js';
