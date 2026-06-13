/**
 * Express app factory for the core pillar container.
 *
 * Phase 3 PR 2 of the core pillar migration added the pillar registry
 * snapshot endpoint (`GET /pillars`) alongside the existing `/health`
 * probe. Phase 5 PR 1 (Track M1) wires the tRPC handler at `/trpc` with
 * the migrated `core.serviceAccounts.*` admin procedures backed by
 * `@pops/core-db` directly.
 *
 * The dispatcher (`POST /uri/resolve`) lands in a subsequent PR. Kept as
 * a factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 */
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express, { type Express, type Request, type Response } from 'express';

import { type CoreApiDeps, makeRequestHandler } from './handlers.js';
import { createExternalDeregisterHandler } from './modules/external-registry/deregister.js';
import { createExternalHeartbeatHandler } from './modules/external-registry/heartbeat.js';
import { createExternalRegisterHandler } from './modules/external-registry/register.js';
import { createRegistrySubscribeHandler } from './modules/registry/subscribe.js';
import { appRouter } from './router.js';
import { createCoreTrpcContextFactory } from './trpc.js';

const SERVER_API_KEY_ENV = 'POPS_INTERNAL_API_KEY';

function defaultResolveApiKey(): string | undefined {
  const raw = process.env[SERVER_API_KEY_ENV];
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export function createCoreApiApp(deps: CoreApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));

  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/pillars', (_req: Request, res: Response) => {
    res.json(handlers.pillars());
  });

  app.get('/registry/subscribe', createRegistrySubscribeHandler(deps.coreDb.db));

  const resolveApiKey = deps.resolveApiKey ?? defaultResolveApiKey;

  app.post(
    '/core.registry.register',
    createExternalRegisterHandler({
      coreDb: deps.coreDb.db,
      resolveApiKey,
    })
  );

  app.post(
    '/core.registry.heartbeat',
    createExternalHeartbeatHandler({
      coreDb: deps.coreDb.db,
      resolveApiKey,
    })
  );

  app.post(
    '/core.registry.deregister',
    createExternalDeregisterHandler({
      coreDb: deps.coreDb.db,
      resolveApiKey,
    })
  );

  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: createCoreTrpcContextFactory(deps.coreDb.db),
    })
  );

  return app;
}
