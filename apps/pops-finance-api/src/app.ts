/**
 * Express app factory for the finance pillar container.
 *
 * Phase 3 PR 1 of the finance pillar migration scaffolded the minimal
 * `/health` surface. Phase 5 PR 1 (Track M2) wires the tRPC handler at
 * `/trpc` with the migrated finance subrouters (wishlist + budgets +
 * the CRUD slice of transactions) backed by `@pops/finance-db` directly.
 *
 * Kept as a factory so the test suite can spin up an in-process
 * `supertest` instance without binding a real port.
 */
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express, { type Express, type Request, type Response } from 'express';

import { type FinanceApiDeps, makeRequestHandler } from './handlers.js';
import { appRouter } from './router.js';
import { createFinanceTrpcContextFactory } from './trpc.js';

export function createFinanceApiApp(deps: FinanceApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Build the handler shape once at factory time so static deps don't
  // get re-allocated on every request.
  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: createFinanceTrpcContextFactory({
        financeDb: deps.financeDb.db,
        coreDb: deps.coreDb?.db,
      }),
    })
  );

  return app;
}
