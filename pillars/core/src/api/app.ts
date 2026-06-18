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
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { type CoreApiDeps, makeRequestHandler } from './handlers.js';
import { createExternalDeregisterHandler } from './modules/external-registry/deregister.js';
import { createExternalHeartbeatHandler } from './modules/external-registry/heartbeat.js';
import { createExternalRegisterHandler } from './modules/external-registry/register.js';
import { createRegistrySubscribeHandler } from './modules/registry/subscribe.js';
import { appRouter } from './router.js';
import { createCoreTrpcContextFactory } from './trpc.js';

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

  // Cross-pillar URI dispatcher (ADR-026 P2). Raw HTTP, mounted before
  // `/trpc`: pillars POST `{ uri }` here and core resolves in-process or
  // proxies to the owning pillar via `POPS_PILLARS`. Never throws — every
  // error path is a typed `UriResolverResult`.
  app.post('/uri/resolve', (req: Request, res: Response, next: NextFunction) => {
    const body: unknown = req.body;
    const rawUri = typeof body === 'object' && body !== null ? Reflect.get(body, 'uri') : undefined;
    const uri = typeof rawUri === 'string' ? rawUri : undefined;
    if (!uri) {
      res.status(400).json({
        kind: 'malformed',
        uri: typeof rawUri === 'string' ? rawUri : '',
        reason: 'request body must be { uri: string }',
      });
      return;
    }
    void handlers
      .resolveUri(uri)
      .then((result) => res.json(result))
      .catch(next);
  });

  // Aggregated cross-pillar health probe (ADR-026 P3). Fans out
  // `GET {baseUrl}/health` against every registered pillar; the self
  // (`core`) entry short-circuits to `'healthy'`.
  app.get('/pillars/health', (_req: Request, res: Response, next: NextFunction) => {
    void handlers
      .pillarsHealth()
      .then((result) => res.json(result))
      .catch(next);
  });

  app.get('/registry/subscribe', createRegistrySubscribeHandler(deps.coreDb.db));

  app.post('/core.registry.register', createExternalRegisterHandler({ coreDb: deps.coreDb.db }));

  app.post('/core.registry.heartbeat', createExternalHeartbeatHandler({ coreDb: deps.coreDb.db }));

  app.post(
    '/core.registry.deregister',
    createExternalDeregisterHandler({ coreDb: deps.coreDb.db })
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
