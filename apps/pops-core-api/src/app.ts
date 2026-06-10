/**
 * Express app factory for the core pillar container.
 *
 * Phase 3 PR 2 of the core pillar migration adds the pillar registry
 * snapshot endpoint (`GET /pillars`) alongside the existing `/health`
 * probe. The dispatcher (`POST /uri/resolve`) + tRPC routers land in
 * subsequent PRs. Kept as a factory so the test suite can spin up an
 * in-process `supertest` instance without binding a real port.
 */
import express, { type Express, type Request, type Response } from 'express';

import { type CoreApiDeps, makeRequestHandler } from './handlers.js';

export function createCoreApiApp(deps: CoreApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Build the handler shape once at factory time so static deps don't
  // get re-allocated on every request.
  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/pillars', (_req: Request, res: Response) => {
    res.json(handlers.pillars());
  });

  return app;
}
