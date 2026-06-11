/**
 * Express app factory for the media pillar container.
 *
 * Phase 3 PR 1 of the media pillar migration booted the minimal `/health`
 * surface so the new container could be wired into docker-compose +
 * Watchtower without depending on the (still-unfinished) tRPC migration.
 *
 * Phase 5 PR 1 (Track M3) wires the tRPC handler at `/trpc` with the
 * migrated `media.shelfImpressions.*` procedures backed by
 * `@pops/media-db` directly. Subsequent sub-PRs add the remaining media
 * writer slices once the per-pillar pattern is proven.
 *
 * Kept as a factory so the test suite can spin up an in-process
 * `supertest` instance without binding a real port. Mirrors
 * `apps/pops-core-api/src/app.ts`.
 */
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express, { type Express, type Request, type Response } from 'express';

import { type MediaApiDeps, makeRequestHandler } from './handlers.js';
import { appRouter } from './router.js';
import { createMediaTrpcContextFactory } from './trpc.js';

export function createMediaApiApp(deps: MediaApiDeps): Express {
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
      createContext: createMediaTrpcContextFactory(deps.mediaDb.db),
    })
  );

  return app;
}
