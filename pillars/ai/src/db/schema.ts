/**
 * AI pillar domain table barrel.
 *
 * Canonical definitions for the AI-ops observability slice
 * (`ai_inference_log`/`ai_inference_daily`/budgets/alerts/providers/
 * pricing). The flat `settings` table backs `@pops/pillar-settings` for
 * the pillar's own `ai.*` keys.
 */
export { aiAlertRules } from './schema/ai-alert-rules.js';
export { aiAlerts } from './schema/ai-alerts.js';
export { aiBudgets } from './schema/ai-budgets.js';
export { aiInferenceDaily } from './schema/ai-inference-daily.js';
export { aiInferenceLog } from './schema/ai-inference-log.js';
export { aiModelPricing } from './schema/ai-model-pricing.js';
export { aiProviders } from './schema/ai-providers.js';
export { settings } from './schema/settings.js';
