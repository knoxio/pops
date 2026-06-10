/**
 * Express app factory for the media pillar container.
 *
 * Phase 3 PR 1 of the media pillar migration boots the minimal surface
 * (`/health`) so the new container can be wired into docker-compose and
 * Watchtower without depending on the (still-unfinished) tRPC migration.
 * Subsequent PRs mount additional routes. Kept as a factory so the test
 * suite can spin up an in-process `supertest` instance without binding a
 * real port.
 *
 * Mirrors `apps/pops-core-api/src/app.ts`.
 */
import express, { type Express, type Request, type Response } from 'express';

import { type MediaApiDeps, makeRequestHandler } from './handlers.js';

export function createMediaApiApp(deps: MediaApiDeps): Express {
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
