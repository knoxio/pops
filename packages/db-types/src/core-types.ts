/**
 * Drizzle `InferSelectModel<T>` / `InferInsertModel<T>` aliases for
 * core-owned tables.
 *
 * Split out of `index.ts` to keep that file under the 200-line max-lines
 * cap once `@pops/db-types` re-exports the core schemas from
 * `@pops/core-db` (PRD-245 US-07). Public surface stays unchanged:
 * `index.ts` re-exports `* from './core-types.js'`.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  aiAlertRules,
  aiAlerts,
  aiBudgets,
  aiInferenceDaily,
  aiInferenceLog,
  aiModelPricing,
  aiProviders,
  aiUsage,
  entities,
  environments,
  settings,
} from '@pops/core-db';

export type EntityRow = InferSelectModel<typeof entities>;
export type EnvironmentRow = InferSelectModel<typeof environments>;
export type SettingRow = InferSelectModel<typeof settings>;

export type AiUsageRow = InferSelectModel<typeof aiUsage>;
export type AiInferenceLogRow = InferSelectModel<typeof aiInferenceLog>;
export type AiInferenceLogInsert = InferInsertModel<typeof aiInferenceLog>;
export type AiInferenceDailyRow = InferSelectModel<typeof aiInferenceDaily>;
export type AiInferenceDailyInsert = InferInsertModel<typeof aiInferenceDaily>;
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
