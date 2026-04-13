/**
 * Shared database types for POPS SQLite schema.
 *
 * Types are inferred from Drizzle ORM table definitions, replacing the
 * previous hand-written Zod schemas. This ensures types stay in sync
 * with the actual database schema used by drizzle-kit migrations.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { aiUsage } from './schema/ai-usage.js';
import type { budgets } from './schema/budgets.js';
import type { comparisonDimensions } from './schema/comparison-dimensions.js';
import type { comparisonSkipCooloffs } from './schema/comparison-skip-cooloffs.js';
import type { comparisonStaleness } from './schema/comparison-staleness.js';
import type { comparisons } from './schema/comparisons.js';
import type { transactionCorrections } from './schema/corrections.js';
import type { debriefResults } from './schema/debrief-results.js';
import type { debriefSessions } from './schema/debrief-sessions.js';
import type { debriefStatus } from './schema/debrief-status.js';
import type { dismissedDiscover } from './schema/dismissed-discover.js';
import type { entities } from './schema/entities.js';
import type { environments } from './schema/environments.js';
import type { episodes } from './schema/episodes.js';
import type { homeInventory } from './schema/inventory.js';
import type { itemConnections } from './schema/item-connections.js';
import type { itemDocuments } from './schema/item-documents.js';
import type { itemPhotos } from './schema/item-photos.js';
import type { locations } from './schema/locations.js';
import type { mediaScores } from './schema/media-scores.js';
import type { mediaWatchlist } from './schema/media-watchlist.js';
import type { movies } from './schema/movies.js';
import type { rotationCandidates } from './schema/rotation-candidates.js';
import type { rotationExclusions } from './schema/rotation-exclusions.js';
import type { rotationLog } from './schema/rotation-log.js';
import type { rotationSources } from './schema/rotation-sources.js';
import type { seasons } from './schema/seasons.js';
import type { settings } from './schema/settings.js';
import type { shelfImpressions } from './schema/shelf-impressions.js';
import type { syncJobResults } from './schema/sync-job-results.js';
import type { syncLogs } from './schema/sync-logs.js';
import type { tagVocabulary } from './schema/tag-vocabulary.js';
import type { tierOverrides } from './schema/tier-overrides.js';
import type { transactionTagRules } from './schema/transaction-tag-rules.js';
import type { transactions } from './schema/transactions.js';
import type { tvShows } from './schema/tv-shows.js';
import type { watchHistory } from './schema/watch-history.js';
import type { wishList } from './schema/wishlist.js';

// Re-export Drizzle table objects for use in queries
export {
  aiUsage,
  budgets,
  comparisonDimensions,
  comparisons,
  comparisonSkipCooloffs,
  comparisonStaleness,
  debriefResults,
  debriefSessions,
  debriefStatus,
  dismissedDiscover,
  entities,
  environments,
  episodes,
  homeInventory,
  itemConnections,
  itemDocuments,
  itemPhotos,
  locations,
  mediaScores,
  mediaWatchlist,
  movies,
  rotationCandidates,
  rotationExclusions,
  rotationLog,
  rotationSources,
  seasons,
  settings,
  shelfImpressions,
  syncJobResults,
  syncLogs,
  tagVocabulary,
  tierOverrides,
  transactionCorrections,
  transactions,
  transactionTagRules,
  tvShows,
  watchHistory,
  wishList,
} from './schema/index.js';

// Select types (what you get back from a SELECT query)
export type TransactionRow = InferSelectModel<typeof transactions>;
export type EntityRow = InferSelectModel<typeof entities>;
export type BudgetRow = InferSelectModel<typeof budgets>;
export type InventoryRow = InferSelectModel<typeof homeInventory>;
export type WishListRow = InferSelectModel<typeof wishList>;
export type TransactionCorrectionRow = InferSelectModel<typeof transactionCorrections>;
export type TagVocabularyRow = InferSelectModel<typeof tagVocabulary>;
export type TransactionTagRuleRow = InferSelectModel<typeof transactionTagRules>;
export type AiUsageRow = InferSelectModel<typeof aiUsage>;
export type EnvironmentRow = InferSelectModel<typeof environments>;
export type MovieRow = InferSelectModel<typeof movies>;
export type TvShowRow = InferSelectModel<typeof tvShows>;
export type SeasonRow = InferSelectModel<typeof seasons>;
export type EpisodeRow = InferSelectModel<typeof episodes>;
export type MediaWatchlistRow = InferSelectModel<typeof mediaWatchlist>;
export type WatchHistoryRow = InferSelectModel<typeof watchHistory>;
export type ComparisonDimensionRow = InferSelectModel<typeof comparisonDimensions>;
export type ComparisonRow = InferSelectModel<typeof comparisons>;
export type MediaScoreRow = InferSelectModel<typeof mediaScores>;
export type LocationRow = InferSelectModel<typeof locations>;
export type ItemConnectionRow = InferSelectModel<typeof itemConnections>;
export type ItemPhotoRow = InferSelectModel<typeof itemPhotos>;
export type ItemDocumentRow = InferSelectModel<typeof itemDocuments>;
export type SettingRow = InferSelectModel<typeof settings>;

// Insert types (what you pass to an INSERT statement)
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
export type LocationInsert = InferInsertModel<typeof locations>;
export type ItemConnectionInsert = InferInsertModel<typeof itemConnections>;
export type ItemPhotoInsert = InferInsertModel<typeof itemPhotos>;
export type ItemDocumentInsert = InferInsertModel<typeof itemDocuments>;
export type SettingInsert = InferInsertModel<typeof settings>;
export type SyncLogRow = InferSelectModel<typeof syncLogs>;
export type SyncLogInsert = InferInsertModel<typeof syncLogs>;
export type SyncJobResultRow = InferSelectModel<typeof syncJobResults>;
export type SyncJobResultInsert = InferInsertModel<typeof syncJobResults>;
export type DismissedDiscoverRow = InferSelectModel<typeof dismissedDiscover>;
export type DismissedDiscoverInsert = InferInsertModel<typeof dismissedDiscover>;
export type ComparisonSkipCooloffRow = InferSelectModel<typeof comparisonSkipCooloffs>;
export type ComparisonSkipCooloffInsert = InferInsertModel<typeof comparisonSkipCooloffs>;
export type ComparisonStalenessRow = InferSelectModel<typeof comparisonStaleness>;
export type ComparisonStalenessInsert = InferInsertModel<typeof comparisonStaleness>;
export type DebriefSessionRow = InferSelectModel<typeof debriefSessions>;
export type DebriefSessionInsert = InferInsertModel<typeof debriefSessions>;
export type DebriefResultRow = InferSelectModel<typeof debriefResults>;
export type DebriefResultInsert = InferInsertModel<typeof debriefResults>;
export type TierOverrideRow = InferSelectModel<typeof tierOverrides>;
export type TierOverrideInsert = InferInsertModel<typeof tierOverrides>;
export type DebriefStatusRow = InferSelectModel<typeof debriefStatus>;
export type DebriefStatusInsert = InferInsertModel<typeof debriefStatus>;
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

// Constants
export const ENTITY_TYPES = ['company', 'person', 'place', 'brand', 'organisation'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const WISH_LIST_PRIORITIES = ['Needing', 'Soon', 'One Day', 'Dreaming'] as const;
export type WishListPriority = (typeof WISH_LIST_PRIORITIES)[number];

export const MEDIA_TYPES = ['movie', 'tv_show'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];
