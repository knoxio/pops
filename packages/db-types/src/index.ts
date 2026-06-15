/**
 * Shared database types for POPS SQLite schema.
 *
 * Types are inferred from Drizzle ORM table definitions, replacing the
 * previous hand-written Zod schemas. This ensures types stay in sync
 * with the actual database schema used by drizzle-kit migrations.
 */
import type { InferSelectModel } from 'drizzle-orm';

import type {
  budgets,
  tagVocabulary,
  tierOverrides,
  transactionCorrections,
  transactionTagRules,
  transactions,
  wishList,
} from '@pops/finance-db';

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
export type BudgetRow = InferSelectModel<typeof budgets>;
export type WishListRow = InferSelectModel<typeof wishList>;
export type TransactionCorrectionRow = InferSelectModel<typeof transactionCorrections>;
export type TagVocabularyRow = InferSelectModel<typeof tagVocabulary>;
export type TransactionTagRuleRow = InferSelectModel<typeof transactionTagRules>;
export type TierOverrideRow = InferSelectModel<typeof tierOverrides>;
export * from './cerebrum-types.js';
export * from './core-types.js';
export * from './food-types.js';
export * from './inventory-types.js';
export * from './lists.js';
export * from './media-types.js';
export * from './pillar-registry.js';
export * from './insert-types.js';
export * from './constants.js';
