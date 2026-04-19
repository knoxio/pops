/**
 * Watch history service — thin orchestrator, re-exports all public functions.
 *
 * Auto-remove from watchlist (PRD-011 R6):
 *   - Movie: removed from watchlist when marked as watched.
 *   - Episode: TV show removed from watchlist when all episodes are watched.
 */

export type { BatchLogResult } from './handlers/batch-operations.js';
export { batchLogWatch } from './handlers/batch-operations.js';
export type { LogWatchResult } from './handlers/log-watch-event.js';
export { logWatch } from './handlers/log-watch-event.js';
export type {
  RecentWatchHistoryListResult,
  WatchHistoryListResult,
} from './handlers/query-helpers.js';
export {
  deleteWatchHistoryEntry,
  getBatchProgress,
  getProgress,
  getWatchHistoryEntry,
  listRecent,
  listWatchHistory,
} from './handlers/query-helpers.js';
