/**
 * Core domain — cross-cutting concerns shared across finance & inventory.
 *
 * Note: envs is an Express router (not tRPC) and is mounted directly in app.ts,
 * not included here.
 */
import { router } from '../../trpc.js';
import { aiAlertsRouter } from './ai-alerts/router.js';
import { aiBudgetsRouter } from './ai-budgets/router.js';
import { aiObservabilityRouter } from './ai-observability/router.js';
import { aiProvidersRouter } from './ai-providers/router.js';
import { aiUsageRouter } from './ai-usage/router.js';
import { correctionsRouter } from './corrections/router.js';
import { embeddingsRouter } from './embeddings/router.js';
import { entitiesRouter } from './entities/router.js';
import { entitiesSearchAdapter } from './entities/search-adapter.js';
import { coreFeaturesManifest } from './features/manifest.js';
import { featuresRouter } from './features/router.js';
import { jobsRouter } from './jobs/router.js';
import { coreMigrations } from './migrations.js';
import { searchRouter } from './search/router.js';
import { serviceAccountsRouter } from './service-accounts/router.js';
import { aiConfigManifest } from './settings/ai-manifest.js';
import { coreOperationalManifest } from './settings/operational-manifest.js';
import { settingsRouter } from './settings/router.js';
import { shellRouter } from './shell/router.js';
import { tagRulesRouter } from './tag-rules/router.js';
import { uriRouter } from './uri/router.js';

import type { ModuleManifest } from '@pops/types';

export const coreRouter = router({
  entities: entitiesRouter,
  aiUsage: aiUsageRouter,
  aiObservability: aiObservabilityRouter,
  aiProviders: aiProvidersRouter,
  aiBudgets: aiBudgetsRouter,
  aiAlerts: aiAlertsRouter,
  corrections: correctionsRouter,
  jobs: jobsRouter,
  embeddings: embeddingsRouter,
  tagRules: tagRulesRouter,
  settings: settingsRouter,
  features: featuresRouter,
  search: searchRouter,
  serviceAccounts: serviceAccountsRouter,
  shell: shellRouter,
  uri: uriRouter,
});

/**
 * PRD-098 manifest. Core is the always-mounted shell module that every
 * domain module is allowed to depend on. The PRD-100 loader treats `core`
 * as non-optional regardless of `POPS_APPS`.
 */
export const manifest: ModuleManifest<typeof coreRouter> = {
  id: 'core',
  name: 'Core',
  version: '0.1.0',
  surfaces: ['app'],
  description:
    'Cross-cutting platform services: entities, AI usage/providers, settings, features, search.',
  backend: { router: coreRouter, migrations: coreMigrations },
  settings: [aiConfigManifest, coreOperationalManifest],
  features: [coreFeaturesManifest],
  search: [entitiesSearchAdapter],
};
