/**
 * Lists tRPC router — PRD-140.
 *
 * Composes the two sub-routers — `list` (header CRUD + index aggregate) and
 * `items` (item CRUD + reorder) — into the public `lists.*` surface. Wired
 * into the app router via `apps/pops-api/src/modules/lists/index.ts`.
 */
import { router } from '../../trpc.js';
import { itemsRouter } from './routers/items.js';
import { listRouter } from './routers/list.js';

export const listsRouter = router({
  list: listRouter,
  items: itemsRouter,
});
