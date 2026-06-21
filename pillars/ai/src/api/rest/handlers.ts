/**
 * ts-rest handler composer for the ai pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<typeof aiContract>` that `createExpressEndpoints`
 * consumes in `app.ts`: the moved AI-ops telemetry handlers (usage reads,
 * observability, providers, budgets, alerts) plus this pillar's own ingest,
 * pricing, and settings handlers.
 */
import { initServer } from '@ts-rest/express';

import { aiContract } from '../../contract/rest.js';
import { type OpenedAiDb } from '../../db/index.js';
import { makeAiAlertsHandlers } from './ai-alerts-handlers.js';
import { makeAiBudgetsHandlers } from './ai-budgets-handlers.js';
import { makeAiObservabilityHandlers } from './ai-observability-handlers.js';
import { makeAiProvidersHandlers } from './ai-providers-handlers.js';
import { makeAiUsageHandlers } from './ai-usage-handlers.js';
import { makeIngestHandler } from './ingest-handlers.js';
import { makePricingHandler } from './pricing-handlers.js';
import { makeAiSettingsHandlers } from './settings-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeAiRestHandlers(deps: {
  aiDb: OpenedAiDb;
}): ReturnType<typeof server.router<typeof aiContract>> {
  const db = deps.aiDb.db;
  return server.router(aiContract, {
    aiAlerts: makeAiAlertsHandlers(db),
    aiBudgets: makeAiBudgetsHandlers(db),
    aiObservability: makeAiObservabilityHandlers(db),
    aiProviders: makeAiProvidersHandlers(db),
    aiUsage: makeAiUsageHandlers(db),
    aiIngest: makeIngestHandler(db),
    aiPricing: makePricingHandler(db),
    settings: makeAiSettingsHandlers(db),
  });
}
