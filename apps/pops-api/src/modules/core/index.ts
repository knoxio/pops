/**
 * Core domain — cross-cutting concerns shared across finance & inventory.
 *
 * Note: envs is an Express router (not tRPC) and is mounted directly in app.ts,
 * not included here.
 */
import { router } from "../../trpc.js";
import { entitiesRouter } from "./entities/router.js";

// Side-effect: register search adapters
import "./entities/search-adapter.js";
import { aiUsageRouter } from "./ai-usage/router.js";
import { correctionsRouter } from "./corrections/router.js";
import { settingsRouter } from "./settings/router.js";
import { searchRouter } from "./search/router.js";
import { tagRulesRouter } from "./tag-rules/router.js";

export const coreRouter = router({
  entities: entitiesRouter,
  aiUsage: aiUsageRouter,
  corrections: correctionsRouter,
  tagRules: tagRulesRouter,
  settings: settingsRouter,
  search: searchRouter,
});
