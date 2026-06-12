/**
 * Root tRPC router for the inventory pillar container.
 *
 * The procedure paths are intentionally rooted at `inventory.*` so the
 * Phase 5 PR 2 dispatcher cutover can be a transparent URL swap rather
 * than a procedure-path rename: existing pops-api clients call
 * `inventory.locations.list`, and inventory-api answers on the same
 * path.
 */
import { itemsRouter } from './modules/items/router.js';
import { locationsRouter } from './modules/locations/router.js';
import { router } from './trpc.js';

export const inventoryRouter = router({
  items: itemsRouter,
  locations: locationsRouter,
});

export const appRouter = router({
  inventory: inventoryRouter,
});

export type AppRouter = typeof appRouter;
