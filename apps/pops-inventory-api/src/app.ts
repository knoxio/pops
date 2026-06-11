/**
 * Express app factory for the inventory pillar container.
 *
 * Phase 3 PR 1 of the inventory pillar migration scaffolded the minimal
 * `/health` + `/pillars` surface. Phase 5 PR 1 (Track M4) wires the
 * tRPC handler at `/trpc` with the migrated `inventory.locations.*`
 * procedures backed by `@pops/inventory-db` directly.
 *
 * The dispatcher (`POST /uri/resolve`) lands in a subsequent PR. Kept as
 * a factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 */
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express, { type Express, type Request, type Response } from 'express';

import { type InventoryApiDeps, makeRequestHandler } from './handlers.js';
import { appRouter } from './router.js';
import { createInventoryTrpcContextFactory } from './trpc.js';

export function createInventoryApiApp(deps: InventoryApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/pillars', (_req: Request, res: Response) => {
    res.json(handlers.pillars());
  });

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: createInventoryTrpcContextFactory({
        inventoryDb: deps.inventoryDb.db,
        coreDb: deps.coreDb?.db,
      }),
    })
  );

  return app;
}
