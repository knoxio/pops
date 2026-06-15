/**
 * Shared database types for POPS SQLite schema.
 *
 * Types are inferred from Drizzle ORM table definitions, replacing the
 * previous hand-written Zod schemas. This ensures types stay in sync
 * with the actual database schema used by drizzle-kit migrations.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  budgets,
  tagVocabulary,
  tierOverrides,
  transactionCorrections,
  transactionTagRules,
  transactions,
  wishList,
} from '@pops/finance-db';

import type { aiAlertRules } from './schema/ai-alert-rules.js';
import type { aiAlerts } from './schema/ai-alerts.js';
import type { aiBudgets } from './schema/ai-budgets.js';
import type { aiInferenceLog } from './schema/ai-inference-log.js';
import type { aiModelPricing } from './schema/ai-model-pricing.js';
import type { aiProviders } from './schema/ai-providers.js';
import type { aiUsage } from './schema/ai-usage.js';
import type { entities } from './schema/entities.js';
import type { environments } from './schema/environments.js';
// `lists` table types are re-exported via `./lists.js` below.
import type { settings } from './schema/settings.js';

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
  fixtures,
  homeInventory,
  batchConsumptions,
  batches,
  ingestSources,
  listItems,
  lists,
  ingredientAliases,
  ingredients,
  ingredientTags,
  ingredientVariants,
  ingredientWeights,
  planEntries,
  planSlots,
  prepStates,
  recipeLines,
  recipeRuns,
  recipes,
  recipeSteps,
  recipeTags,
  recipeVersionProposedSlugs,
  recipeVersionRejections,
  recipeVersions,
  slugRegistry,
  substitutions,
  unitConversions,
  itemConnections,
  itemFixtureConnections,
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
  userSettings,
  watchHistory,
  wishList,
} from './schema/index.js';

// Select types (what you get back from a SELECT query)
export type TransactionRow = InferSelectModel<typeof transactions>;
export type EntityRow = InferSelectModel<typeof entities>;
export type BudgetRow = InferSelectModel<typeof budgets>;
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
export type EnvironmentRow = InferSelectModel<typeof environments>;
export * from './food-types.js';
export * from './inventory-types.js';
export * from './lists.js';
export type SettingRow = InferSelectModel<typeof settings>;
export type TierOverrideRow = InferSelectModel<typeof tierOverrides>;
export * from './cerebrum-types.js';
export * from './media-types.js';
export * from './pillar-registry.js';
export * from './insert-types.js';
export * from './constants.js';
