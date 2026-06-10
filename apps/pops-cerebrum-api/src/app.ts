/**
 * Express app factory for the cerebrum pillar container.
 *
 * Phase 3 PR 1 of the cerebrum pillar migration ships the minimal
 * `/health` surface so the new container can be wired into
 * docker-compose + Watchtower without depending on the (still-unfinished)
 * tRPC + URI-dispatcher migration. Kept as a factory so the test suite
 * can spin up an in-process `supertest` instance without binding a real
 * port.
 */
import express, { type Express, type Request, type Response } from 'express';

import { type CerebrumApiDeps, makeRequestHandler } from './handlers.js';

export function createCerebrumApiApp(deps: CerebrumApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Build the handler shape once at factory time so static deps don't
  // get re-allocated on every request.
  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  return app;
}
