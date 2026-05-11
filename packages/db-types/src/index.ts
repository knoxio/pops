/**
 * Shared database types for POPS SQLite schema.
 *
 * Types are inferred from Drizzle ORM table definitions, replacing the
 * previous hand-written Zod schemas. This ensures types stay in sync
 * with the actual database schema used by drizzle-kit migrations.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { aiAlertRules } from './schema/ai-alert-rules.js';
import type { aiAlerts } from './schema/ai-alerts.js';
import type { aiBudgets } from './schema/ai-budgets.js';
import type { aiInferenceLog } from './schema/ai-inference-log.js';
import type { aiModelPricing } from './schema/ai-model-pricing.js';
import type { aiProviders } from './schema/ai-providers.js';
import type { aiUsage } from './schema/ai-usage.js';
import type { budgets } from './schema/budgets.js';
import type { comparisonDimensions } from './schema/comparison-dimensions.js';
import type { comparisonSkipCooloffs } from './schema/comparison-skip-cooloffs.js';
import type { comparisonStaleness } from './schema/comparison-staleness.js';
import type { comparisons } from './schema/comparisons.js';
import type { embeddings } from './schema/core/embeddings.js';
import type { transactionCorrections } from './schema/corrections.js';
import type { debriefResults } from './schema/debrief-results.js';
import type { debriefSessions } from './schema/debrief-sessions.js';
import type { debriefStatus } from './schema/debrief-status.js';
import type { dismissedDiscover } from './schema/dismissed-discover.js';
import type { engramIndex, engramLinks, engramScopes, engramTags } from './schema/engrams.js';
import type { entities } from './schema/entities.js';
import type { environments } from './schema/environments.js';
import type { episodes } from './schema/episodes.js';
import type { homeInventory } from './schema/inventory.js';
import type { itemConnections } from './schema/item-connections.js';
import type { itemDocuments } from './schema/item-documents.js';
import type { itemPhotos } from './schema/item-photos.js';
import type { itemUploadedFiles } from './schema/item-uploaded-files.js';
import type { locations } from './schema/locations.js';
import type { mediaScores } from './schema/media-scores.js';
import type { mediaWatchlist } from './schema/media-watchlist.js';
import type { movies } from './schema/movies.js';
import type { nudgeLog } from './schema/nudge-log.js';
import type { reflexExecutions } from './schema/reflex-executions.js';
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
  aiAlertRules,
  aiAlerts,
  aiBudgets,
  aiInferenceDaily,
  aiInferenceLog,
  aiModelPricing,
  aiProviders,
  aiUsage,
  embeddings,
  budgets,
  comparisonDimensions,
  comparisons,
  comparisonSkipCooloffs,
  comparisonStaleness,
  debriefResults,
  debriefSessions,
  debriefStatus,
  dismissedDiscover,
  engramIndex,
  engramLinks,
  engramScopes,
  engramTags,
  entities,
  reflexExecutions,
  environments,
  episodes,
  homeInventory,
  itemConnections,
  itemDocuments,
  itemPhotos,
  itemUploadedFiles,
  locations,
  mediaScores,
  mediaWatchlist,
  movies,
  nudgeLog,
  rotationCandidates,
  rotationExclusions,
  rotationLog,
  rotationSources,
  seasons,
  serviceAccounts,
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
export type AiInferenceLogRow = InferSelectModel<typeof aiInferenceLog>;
export type AiInferenceLogInsert = InferInsertModel<typeof aiInferenceLog>;
export type { AiInferenceDailyInsert, AiInferenceDailyRow } from './schema/ai-inference-daily.js';
export type AiProviderRow = InferSelectModel<typeof aiProviders>;
export type AiProviderInsert = InferInsertModel<typeof aiProviders>;
export type AiModelPricingRow = InferSelectModel<typeof aiModelPricing>;
export type AiModelPricingInsert = InferInsertModel<typeof aiModelPricing>;
export type AiBudgetRow = InferSelectModel<typeof aiBudgets>;
export type AiBudgetInsert = InferInsertModel<typeof aiBudgets>;
export type AiAlertRuleRow = InferSelectModel<typeof aiAlertRules>;
export type AiAlertRuleInsert = InferInsertModel<typeof aiAlertRules>;
export type AiAlertRow = InferSelectModel<typeof aiAlerts>;
export type AiAlertInsert = InferInsertModel<typeof aiAlerts>;
export type EmbeddingRow = InferSelectModel<typeof embeddings>;
export type EmbeddingInsert = InferInsertModel<typeof embeddings>;
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
export type ItemUploadedFileRow = InferSelectModel<typeof itemUploadedFiles>;
export type ItemDocumentRow = InferSelectModel<typeof itemDocuments>;
export type SettingRow = InferSelectModel<typeof settings>;

export type SyncLogRow = InferSelectModel<typeof syncLogs>;
export type SyncJobResultRow = InferSelectModel<typeof syncJobResults>;
export type DismissedDiscoverRow = InferSelectModel<typeof dismissedDiscover>;
export type EngramIndexRow = InferSelectModel<typeof engramIndex>;
export type EngramScopeRow = InferSelectModel<typeof engramScopes>;
export type EngramTagRow = InferSelectModel<typeof engramTags>;
export type EngramLinkRow = InferSelectModel<typeof engramLinks>;
export type ReflexExecutionRow = InferSelectModel<typeof reflexExecutions>;
export type ComparisonSkipCooloffRow = InferSelectModel<typeof comparisonSkipCooloffs>;
export type ComparisonStalenessRow = InferSelectModel<typeof comparisonStaleness>;
export type DebriefSessionRow = InferSelectModel<typeof debriefSessions>;
export type DebriefResultRow = InferSelectModel<typeof debriefResults>;
export type TierOverrideRow = InferSelectModel<typeof tierOverrides>;
export type DebriefStatusRow = InferSelectModel<typeof debriefStatus>;
export type ShelfImpressionRow = InferSelectModel<typeof shelfImpressions>;
export type RotationLogRow = InferSelectModel<typeof rotationLog>;
export type RotationSourceRow = InferSelectModel<typeof rotationSources>;
export type RotationCandidateRow = InferSelectModel<typeof rotationCandidates>;
export type RotationExclusionRow = InferSelectModel<typeof rotationExclusions>;
export type NudgeLogRow = InferSelectModel<typeof nudgeLog>;
export * from './insert-types.js';
export * from './constants.js';
