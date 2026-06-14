/**
 * Drizzle `InferSelectModel<T>` aliases for media-owned tables.
 *
 * Split out of `index.ts` to keep that file under the file-size lint
 * cap once `@pops/db-types` re-exports the media schemas from
 * `@pops/media-db` (PRD-245 US-04). Public surface stays unchanged:
 * `index.ts` re-exports `* from './media-types.js'`.
 */
import type { InferSelectModel } from 'drizzle-orm';

import type {
  comparisonDimensions,
  comparisonSkipCooloffs,
  comparisonStaleness,
  comparisons,
  dismissedDiscover,
  episodes,
  mediaScores,
  mediaWatchlist,
  movies,
  rotationCandidates,
  rotationExclusions,
  rotationLog,
  rotationSources,
  seasons,
  shelfImpressions,
  syncJobResults,
  syncLogs,
  tvShows,
  watchHistory,
} from '@pops/media-db';

export type MovieRow = InferSelectModel<typeof movies>;
export type TvShowRow = InferSelectModel<typeof tvShows>;
export type SeasonRow = InferSelectModel<typeof seasons>;
export type EpisodeRow = InferSelectModel<typeof episodes>;
export type MediaWatchlistRow = InferSelectModel<typeof mediaWatchlist>;
export type WatchHistoryRow = InferSelectModel<typeof watchHistory>;
export type ComparisonDimensionRow = InferSelectModel<typeof comparisonDimensions>;
export type ComparisonRow = InferSelectModel<typeof comparisons>;
export type MediaScoreRow = InferSelectModel<typeof mediaScores>;
export type SyncLogRow = InferSelectModel<typeof syncLogs>;
export type SyncJobResultRow = InferSelectModel<typeof syncJobResults>;
export type DismissedDiscoverRow = InferSelectModel<typeof dismissedDiscover>;
export type ComparisonSkipCooloffRow = InferSelectModel<typeof comparisonSkipCooloffs>;
export type ComparisonStalenessRow = InferSelectModel<typeof comparisonStaleness>;
export type ShelfImpressionRow = InferSelectModel<typeof shelfImpressions>;
export type RotationLogRow = InferSelectModel<typeof rotationLog>;
export type RotationSourceRow = InferSelectModel<typeof rotationSources>;
export type RotationCandidateRow = InferSelectModel<typeof rotationCandidates>;
export type RotationExclusionRow = InferSelectModel<typeof rotationExclusions>;
