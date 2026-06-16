/**
 * Lists tRPC router — PRD-140.
 *
 * Composes the two sub-routers — `list` (header CRUD + index aggregate) and
 * `items` (item CRUD + reorder) — into the public `lists.*` surface.
 * Mounted on the pillar's HTTP server at `/trpc/*` by `server.ts`.
 */
import { itemsRouter } from './routers/items.js';
import { listRouter } from './routers/list.js';
import { router } from './trpc.js';

export const listsRouter = router({
  list: listRouter,
  items: itemsRouter,
});

export type ListsRouter = typeof listsRouter;
