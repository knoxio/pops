/**
 * The ai pillar's ts-rest contract — the canonical wire surface served by the
 * `pops-ai` container.
 *
 * Composes the AI-ops telemetry routers (usage reads, observability, providers,
 * budgets, alerts), the cross-pillar ingest `POST /ai-usage/record`
 * (`aiIngest`), the pricing read `GET /ai-pricing/:p/:m` (`aiPricing`), and the
 * per-pillar `settings.*` RU+reset surface for its own `ai.*` keys.
 */
import { initContract } from '@ts-rest/core';

import { aiAlertsContract } from './rest-ai-alerts.js';
import { aiBudgetsContract } from './rest-ai-budgets.js';
import { aiObservabilityContract } from './rest-ai-observability.js';
import { aiProvidersContract } from './rest-ai-providers.js';
import { aiUsageContract } from './rest-ai-usage.js';
import { aiIngestContract } from './rest-ingest.js';
import { aiPricingContract } from './rest-pricing.js';
import { aiSettingsContract } from './rest-settings.js';

const c = initContract();

export const aiContract = c.router(
  {
    aiAlerts: aiAlertsContract,
    aiBudgets: aiBudgetsContract,
    aiObservability: aiObservabilityContract,
    aiProviders: aiProvidersContract,
    aiUsage: aiUsageContract,
    aiIngest: aiIngestContract,
    aiPricing: aiPricingContract,
    settings: aiSettingsContract,
  },
  { pathPrefix: '' }
);
