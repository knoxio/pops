/**
 * Core domain table barrel.
 *
 * Canonical definitions for core-owned tables (entities, environments,
 * pillar registry, service accounts, settings, user settings, plus the
 * `ai_*` observability slice) live in this package per PRD-245 US-07
 * (audit H6/H7).
 *
 * `@pops/db-types` re-exports these tables as a transition shim so legacy
 * import sites keep compiling until PRD-245 US-08 deletes the shim. Pillar
 * consumers should import from `@pops/core-db` directly.
 */
export { aiAlertRules } from './schema/ai-alert-rules.js';
export { aiAlerts } from './schema/ai-alerts.js';
export { aiBudgets } from './schema/ai-budgets.js';
export { aiInferenceDaily } from './schema/ai-inference-daily.js';
export { aiInferenceLog } from './schema/ai-inference-log.js';
export { aiModelPricing } from './schema/ai-model-pricing.js';
export { aiProviders } from './schema/ai-providers.js';
export { aiUsage } from './schema/ai-usage.js';
export { entities } from './schema/entities.js';
export { environments } from './schema/environments.js';
export { pillarRegistry } from './schema/pillar-registry.js';
export { serviceAccounts } from './schema/service-accounts.js';
export { settings } from './schema/settings.js';
export { userSettings } from './schema/user-settings.js';

// `syncJobResults` is owned by `@pops/media-db` (PRD-245 US-04) but the
// historical sync-results service in this package writes to it. Re-exported
// here so existing imports keep resolving.
export { syncJobResults } from '@pops/media-db';
