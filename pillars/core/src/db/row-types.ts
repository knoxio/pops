/**
 * Public `Row`/`Insert` aliases for the core-owned tables.
 *
 * Centralised here so consumers can `import type { EntityRow } from
 * '@pops/core-db'` without reaching into a service module. The
 * underlying tables live in `./schema/*.ts` (PRD-245 US-07).
 *
 * Service-owned types (`SettingRow`, `AiBudgetRow`, `AiInferenceLogRow`,
 * etc.) live in their respective service modules and are re-exported
 * via `./index.ts`. This file hosts the remaining inferred row aliases
 * plus the `ENTITY_TYPES` discriminator set co-located with the table.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

export { ENTITY_TYPES, type EntityType } from './schema/entity-types.js';

import type {
  aiAlertRules,
  aiAlerts,
  aiProviders,
  aiModelPricing,
  aiUsage,
  entities,
  environments,
  userSettings,
} from './schema.js';

export type EntityRow = InferSelectModel<typeof entities>;
export type EntityInsert = InferInsertModel<typeof entities>;

export type EnvironmentRow = InferSelectModel<typeof environments>;
export type EnvironmentInsert = InferInsertModel<typeof environments>;

export type UserSettingRow = InferSelectModel<typeof userSettings>;
export type UserSettingInsert = InferInsertModel<typeof userSettings>;

export type AiUsageRow = InferSelectModel<typeof aiUsage>;
export type AiUsageInsert = InferInsertModel<typeof aiUsage>;

export type AiProviderRow = InferSelectModel<typeof aiProviders>;
export type AiProviderInsert = InferInsertModel<typeof aiProviders>;

export type AiModelPricingRow = InferSelectModel<typeof aiModelPricing>;
export type AiModelPricingInsert = InferInsertModel<typeof aiModelPricing>;

export type AiAlertRuleRow = InferSelectModel<typeof aiAlertRules>;
export type AiAlertRuleInsert = InferInsertModel<typeof aiAlertRules>;

export type AiAlertRow = InferSelectModel<typeof aiAlerts>;
export type AiAlertInsert = InferInsertModel<typeof aiAlerts>;
