/**
 * Core domain table barrel.
 *
 * Canonical definitions for core-owned tables (environments,
 * pillar registry, service accounts, settings, user settings, plus the
 * finance-categorizer `ai_usage` table) live in this package per
 * PRD-245 US-07 (audit H6/H7). The AI-ops observability slice
 * (`ai_inference_log`/`ai_inference_daily`/budgets/alerts/providers/
 * pricing) extracted out to the `ai` pillar (PRD-055).
 *
 */
export { aiUsage } from './schema/ai-usage.js';
export { environments } from './schema/environments.js';
export { pillarRegistry } from './schema/pillar-registry.js';
export { serviceAccounts } from './schema/service-accounts.js';
export { settings } from './schema/settings.js';
export { syncJobResults } from './schema/sync-job-results.js';
export { userSettings } from './schema/user-settings.js';
