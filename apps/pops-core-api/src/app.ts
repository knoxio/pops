/**
 * Express app factory for the core pillar container.
 *
 * Phase 3 PR 1 of the core pillar migration scaffolds the new
 * `core-api` process with just a `/health` probe; the tRPC handler,
 * pillar registry, and URI dispatcher migrate in later PRs of the
 * phase. Kept as a factory so the test suite can spin up an in-process
 * `supertest` instance without having to bind a real port.
 */
import express, { type Express, type Request, type Response } from 'express';

import { type CoreApiDeps, makeRequestHandler } from './handlers.js';

export function createCoreApiApp(deps: CoreApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req: Request, res: Response) => {
    res.json(makeRequestHandler(deps).health());
  });

  return app;
}
