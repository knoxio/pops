/**
 * Public `Row`/`Insert` aliases for the ai pillar's tables.
 *
 * Centralised here so consumers can `import type { AiAlertRow } from
 * '../../../db/index.js'` without reaching into a service module. The
 * underlying tables live in `./schema/*.ts`.
 *
 * Service-owned types (`AiBudgetRow`, `AiInferenceLogRow`, etc.) live in
 * their respective service modules and are re-exported via `./index.ts`.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type { aiAlertRules, aiAlerts, aiModelPricing, aiProviders } from './schema.js';

export type AiProviderRow = InferSelectModel<typeof aiProviders>;
export type AiProviderInsert = InferInsertModel<typeof aiProviders>;

export type AiModelPricingRow = InferSelectModel<typeof aiModelPricing>;
export type AiModelPricingInsert = InferInsertModel<typeof aiModelPricing>;

export type AiAlertRuleRow = InferSelectModel<typeof aiAlertRules>;
export type AiAlertRuleInsert = InferInsertModel<typeof aiAlertRules>;

export type AiAlertRow = InferSelectModel<typeof aiAlerts>;
export type AiAlertInsert = InferInsertModel<typeof aiAlerts>;
