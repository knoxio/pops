/**
 * Core domain table barrel.
 *
 * Canonical definitions for core-owned tables (entities, environments,
 * pillar registry, service accounts, settings, user settings, plus the
 * `ai_*` observability slice) live in this package per PRD-245 US-07
 * (audit H6/H7).
 *
 */
export { aiInferenceLog, entities } from '@pops/shared-schema';

export { aiAlertRules } from './schema/ai-alert-rules.js';
export { aiAlerts } from './schema/ai-alerts.js';
export { aiBudgets } from './schema/ai-budgets.js';
export { aiInferenceDaily } from './schema/ai-inference-daily.js';
export { aiModelPricing } from './schema/ai-model-pricing.js';
export { aiProviders } from './schema/ai-providers.js';
export { aiUsage } from './schema/ai-usage.js';
export { environments } from './schema/environments.js';
export { pillarRegistry } from './schema/pillar-registry.js';
export { serviceAccounts } from './schema/service-accounts.js';
export { settings } from './schema/settings.js';
export { syncJobResults } from './schema/sync-job-results.js';
export { userSettings } from './schema/user-settings.js';
