/**
 * Local re-export of the core domain tables.
 *
 * Canonical definitions live in `./schema/*.ts` per PRD-245 US-07. The
 * `@pops/db-types` re-export shim continues to surface them for legacy
 * import sites until PRD-245 US-08 deletes that directory.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  aiAlertRules,
  aiAlerts,
  aiModelPricing,
  aiProviders,
  aiUsage,
  entities,
  environments,
  syncJobResults,
  transactionCorrections,
} from './schema/index.js';

export {
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
  pillarRegistry,
  serviceAccounts,
  settings,
  syncJobResults,
  transactionCorrections,
  userSettings,
} from './schema/index.js';

export type { AiInferenceDailyInsert } from './schema/index.js';

export type EntityRow = InferSelectModel<typeof entities>;
export type EntityInsert = InferInsertModel<typeof entities>;
export type EnvironmentRow = InferSelectModel<typeof environments>;
export type EnvironmentInsert = InferInsertModel<typeof environments>;
export type TransactionCorrectionRow = InferSelectModel<typeof transactionCorrections>;
export type TransactionCorrectionInsert = InferInsertModel<typeof transactionCorrections>;
export type SyncJobResultRow = InferSelectModel<typeof syncJobResults>;
export type SyncJobResultInsert = InferInsertModel<typeof syncJobResults>;

export type AiAlertRow = InferSelectModel<typeof aiAlerts>;
export type AiAlertInsert = InferInsertModel<typeof aiAlerts>;
export type AiAlertRuleRow = InferSelectModel<typeof aiAlertRules>;
export type AiAlertRuleInsert = InferInsertModel<typeof aiAlertRules>;
export type AiProviderRow = InferSelectModel<typeof aiProviders>;
export type AiProviderInsert = InferInsertModel<typeof aiProviders>;
export type AiModelPricingRow = InferSelectModel<typeof aiModelPricing>;
export type AiModelPricingInsert = InferInsertModel<typeof aiModelPricing>;
export type AiUsageRow = InferSelectModel<typeof aiUsage>;
