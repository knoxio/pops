/**
 * Drizzle `InferInsertModel<T>` aliases for every table. Split out of
 * `index.ts` to keep that file under the file-size lint cap.
 *
 * Re-exported from `index.ts` so all existing imports continue to work.
 */
import type { InferInsertModel } from 'drizzle-orm';

import type {
  debriefResults,
  debriefSessions,
  debriefStatus,
  engramIndex,
  engramLinks,
  engramScopes,
  engramTags,
  nudgeLog,
  reflexExecutions,
} from '@pops/cerebrum-db';
import type { aiUsage, entities, environments, settings } from '@pops/core-db';
import type {
  budgets,
  tierOverrides,
  transactionCorrections,
  transactions,
  wishList,
} from '@pops/finance-db';
import type {
  fixtures,
  homeInventory,
  itemConnections,
  itemDocuments,
  itemFixtureConnections,
  itemPhotos,
  itemUploadedFiles,
  locations,
} from '@pops/inventory-db';
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

export type TransactionInsert = InferInsertModel<typeof transactions>;
export type EntityInsert = InferInsertModel<typeof entities>;
export type BudgetInsert = InferInsertModel<typeof budgets>;
export type InventoryInsert = InferInsertModel<typeof homeInventory>;
export type WishListInsert = InferInsertModel<typeof wishList>;
export type TransactionCorrectionInsert = InferInsertModel<typeof transactionCorrections>;
export type AiUsageInsert = InferInsertModel<typeof aiUsage>;
export type EnvironmentInsert = InferInsertModel<typeof environments>;
export type MovieInsert = InferInsertModel<typeof movies>;
export type TvShowInsert = InferInsertModel<typeof tvShows>;
export type SeasonInsert = InferInsertModel<typeof seasons>;
export type EpisodeInsert = InferInsertModel<typeof episodes>;
export type MediaWatchlistInsert = InferInsertModel<typeof mediaWatchlist>;
export type WatchHistoryInsert = InferInsertModel<typeof watchHistory>;
export type ComparisonDimensionInsert = InferInsertModel<typeof comparisonDimensions>;
export type ComparisonInsert = InferInsertModel<typeof comparisons>;
export type MediaScoreInsert = InferInsertModel<typeof mediaScores>;
export type FixtureInsert = InferInsertModel<typeof fixtures>;
export type LocationInsert = InferInsertModel<typeof locations>;
export type ItemConnectionInsert = InferInsertModel<typeof itemConnections>;
export type ItemFixtureConnectionInsert = InferInsertModel<typeof itemFixtureConnections>;
export type ItemPhotoInsert = InferInsertModel<typeof itemPhotos>;
export type ItemUploadedFileInsert = InferInsertModel<typeof itemUploadedFiles>;
export type ItemDocumentInsert = InferInsertModel<typeof itemDocuments>;
export type SettingInsert = InferInsertModel<typeof settings>;
export type SyncLogInsert = InferInsertModel<typeof syncLogs>;
export type SyncJobResultInsert = InferInsertModel<typeof syncJobResults>;
export type DismissedDiscoverInsert = InferInsertModel<typeof dismissedDiscover>;
export type EngramIndexInsert = InferInsertModel<typeof engramIndex>;
export type EngramScopeInsert = InferInsertModel<typeof engramScopes>;
export type EngramTagInsert = InferInsertModel<typeof engramTags>;
export type EngramLinkInsert = InferInsertModel<typeof engramLinks>;
export type ReflexExecutionInsert = InferInsertModel<typeof reflexExecutions>;
export type ComparisonSkipCooloffInsert = InferInsertModel<typeof comparisonSkipCooloffs>;
export type ComparisonStalenessInsert = InferInsertModel<typeof comparisonStaleness>;
export type DebriefSessionInsert = InferInsertModel<typeof debriefSessions>;
export type DebriefResultInsert = InferInsertModel<typeof debriefResults>;
export type TierOverrideInsert = InferInsertModel<typeof tierOverrides>;
export type DebriefStatusInsert = InferInsertModel<typeof debriefStatus>;
export type ShelfImpressionInsert = InferInsertModel<typeof shelfImpressions>;
export type RotationLogInsert = InferInsertModel<typeof rotationLog>;
export type RotationSourceInsert = InferInsertModel<typeof rotationSources>;
export type RotationCandidateInsert = InferInsertModel<typeof rotationCandidates>;
export type RotationExclusionInsert = InferInsertModel<typeof rotationExclusions>;
export type NudgeLogInsert = InferInsertModel<typeof nudgeLog>;
