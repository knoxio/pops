/**
 * Public `Row`/`Insert` aliases for the media-owned tables.
 *
 * Centralised here and re-exported via `./index.js` so consumers import media
 * row types from one place without reaching into a service or schema module.
 * The underlying tables live in `./schema/*.ts`.
 *
 * Service-owned types (`MovieRow`, `TvShowRow`, `WatchHistoryRow`,
 * `MediaWatchlistRow`, `DismissedDiscoverRow`) are also exported by their
 * respective service modules and re-exported via `./index.ts`; this file
 * hosts the remaining inferred row aliases plus the `MEDIA_TYPES` constant.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

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
  tierOverrides,
  tvShows,
  watchHistory,
} from './schema.js';

export type MovieInsert = InferInsertModel<typeof movies>;
export type TvShowInsert = InferInsertModel<typeof tvShows>;
export type MediaWatchlistInsert = InferInsertModel<typeof mediaWatchlist>;
export type WatchHistoryInsert = InferInsertModel<typeof watchHistory>;
export type DismissedDiscoverInsert = InferInsertModel<typeof dismissedDiscover>;

export type SeasonRow = InferSelectModel<typeof seasons>;
export type SeasonInsert = InferInsertModel<typeof seasons>;

export type EpisodeRow = InferSelectModel<typeof episodes>;
export type EpisodeInsert = InferInsertModel<typeof episodes>;

export type ComparisonDimensionRow = InferSelectModel<typeof comparisonDimensions>;
export type ComparisonDimensionInsert = InferInsertModel<typeof comparisonDimensions>;

export type ComparisonRow = InferSelectModel<typeof comparisons>;
export type ComparisonInsert = InferInsertModel<typeof comparisons>;

export type MediaScoreRow = InferSelectModel<typeof mediaScores>;
export type MediaScoreInsert = InferInsertModel<typeof mediaScores>;

export type SyncLogRow = InferSelectModel<typeof syncLogs>;
export type SyncLogInsert = InferInsertModel<typeof syncLogs>;

export type SyncJobResultRow = InferSelectModel<typeof syncJobResults>;
export type SyncJobResultInsert = InferInsertModel<typeof syncJobResults>;

export type ComparisonSkipCooloffRow = InferSelectModel<typeof comparisonSkipCooloffs>;
export type ComparisonSkipCooloffInsert = InferInsertModel<typeof comparisonSkipCooloffs>;

export type ComparisonStalenessRow = InferSelectModel<typeof comparisonStaleness>;
export type ComparisonStalenessInsert = InferInsertModel<typeof comparisonStaleness>;

export type TierOverrideRow = InferSelectModel<typeof tierOverrides>;
export type TierOverrideInsert = InferInsertModel<typeof tierOverrides>;

export type ShelfImpressionRow = InferSelectModel<typeof shelfImpressions>;
export type ShelfImpressionInsert = InferInsertModel<typeof shelfImpressions>;

export type RotationLogRow = InferSelectModel<typeof rotationLog>;
export type RotationLogInsert = InferInsertModel<typeof rotationLog>;

export type RotationSourceRow = InferSelectModel<typeof rotationSources>;
export type RotationSourceInsert = InferInsertModel<typeof rotationSources>;

export type RotationCandidateRow = InferSelectModel<typeof rotationCandidates>;
export type RotationCandidateInsert = InferInsertModel<typeof rotationCandidates>;

export type RotationExclusionRow = InferSelectModel<typeof rotationExclusions>;
export type RotationExclusionInsert = InferInsertModel<typeof rotationExclusions>;

export const MEDIA_TYPES = ['movie', 'tv_show'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
