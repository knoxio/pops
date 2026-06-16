/**
 * Express app factory for the lists pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes, plus the pillar's
 * tRPC surface at `/trpc/*`. Kept as a factory so the test suite can
 * spin up an in-process `supertest` instance without binding a real
 * port.
 */
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express, { type Express, type Request, type Response } from 'express';

import { type ListsApiDeps, makeRequestHandler } from './handlers.js';
import { listsRouter } from './router.js';
import { createContextFactory } from './trpc.js';

export function createListsApiApp(deps: ListsApiDeps): Express {
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
      router: listsRouter,
      createContext: createContextFactory(deps.listsDb.db),
    })
  );

  return app;
}
