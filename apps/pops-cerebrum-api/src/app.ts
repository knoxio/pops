/**
 * Express app factory for the cerebrum pillar container.
 *
 * Phase 3 PR 1 of the cerebrum pillar migration shipped the minimal
 * `/health` surface so the new container could be wired into
 * docker-compose + Watchtower without depending on the (still-unfinished)
 * tRPC + URI-dispatcher migration. Phase 5 PR 1 (Track M5) wires the
 * tRPC handler at `/trpc` with the migrated
 * `cerebrum.nudges.{list,get,dismiss,contradictions}` procedures backed
 * by `@pops/cerebrum-db` directly.
 *
 * The `/uri/resolve` dispatcher handler lands in a subsequent PR. Kept
 * as a factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 */
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express, { type Express, type Request, type Response } from 'express';

import { type CerebrumApiDeps, makeRequestHandler } from './handlers.js';
import { appRouter } from './router.js';
import { createCerebrumTrpcContextFactory } from './trpc.js';

export function createCerebrumApiApp(deps: CerebrumApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: createCerebrumTrpcContextFactory({
        coreDb: deps.coreDb.db,
        cerebrumDb: deps.cerebrumDb.db,
      }),
    })
  );

  return app;
}
