/**
 * Core domain — cross-cutting concerns shared across finance & inventory.
 *
 * Note: envs is an Express router (not tRPC) and is mounted directly in app.ts,
 * not included here.
 */
// Side-effect: register search adapters
import './entities/search-adapter.js';

import { router } from '../../trpc.js';
import { aiUsageRouter } from './ai-usage/router.js';
import { correctionsRouter } from './corrections/router.js';
import { entitiesRouter } from './entities/router.js';
import { jobsRouter } from './jobs/router.js';
import { searchRouter } from './search/router.js';
import { settingsRouter } from './settings/router.js';
import { tagRulesRouter } from './tag-rules/router.js';

export const coreRouter = router({
  entities: entitiesRouter,
  aiUsage: aiUsageRouter,
  corrections: correctionsRouter,
  jobs: jobsRouter,
  tagRules: tagRulesRouter,
  settings: settingsRouter,
  search: searchRouter,
});
