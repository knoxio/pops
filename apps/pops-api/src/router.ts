/**
 * Main tRPC app router — combines domain routers.
 *
 * Domain structure:
 *   core     — entities, ai-usage, corrections
 *   finance  — transactions, budgets, imports, wishlist
 *   inventory — items
 *   media    — comparisons
 *
 * Note: envs is an Express router (not tRPC) — mounted directly in app.ts.
 */
import { router } from "./trpc.js";
import { coreRouter } from "./modules/core/index.js";
import { financeRouter } from "./modules/finance/index.js";
import { inventoryRouter } from "./modules/inventory/index.js";
import { mediaRouter } from "./modules/media/index.js";

/**
 * Root application router.
 * All tRPC procedures are nested under their domain group.
 */
export const appRouter = router({
  core: coreRouter,
  finance: financeRouter,
  inventory: inventoryRouter,
  media: mediaRouter,
});

/** Export the router type for use by tRPC clients. */
export type AppRouter = typeof appRouter;
