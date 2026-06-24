/**
 * Backend-safe barrel for the ai pillar's persistence layer.
 *
 * Hosts the AI-ops observability slice (`ai_inference_log`/
 * `ai_inference_daily`/budgets/alerts/providers/pricing), plus the flat
 * `settings` table backing the pillar's own `ai.*` keys.
 */
export * from './errors.js';
export * from './row-types.js';
export * from './schema.js';

export type { AiDb } from './services/internal.js';

export { openAiDb, type OpenedAiDb } from './open-ai-db.js';

export * as aiUsageService from './services/ai-usage.js';
export * as aiModelPricingService from './services/ai-model-pricing.js';
export * as settingsService from './services/settings.js';

export type { ModelPrice, PricingCache } from './services/ai-model-pricing.js';

export type {
  AiBudget,
  AiBudgetInsert,
  AiBudgetRow,
  AiInferenceDaily,
  AiInferenceDailyRow,
  AiInferenceLog,
  AiInferenceLogInsert,
  AiInferenceLogRow,
  CreateInferenceLogInput,
  DashboardInferenceLogDailyRow,
  DashboardInferenceLogStats,
  GroupInferenceLogByDateFilter,
  InferenceDailyAggregate,
  InferenceLogRetentionRow,
  ListInferenceLogsFilter,
  UpsertBudgetInput,
} from './services/ai-usage.js';

export type {
  Setting,
  SetSettingInput,
  SettingListResult,
  SettingRow,
} from './services/settings.js';
