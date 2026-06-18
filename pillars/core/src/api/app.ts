/**
 * Express app factory for the core pillar container.
 *
 * Phase 3 PR 2 of the core pillar migration added the pillar registry
 * snapshot endpoint (`GET /pillars`) alongside the existing `/health`
 * probe. Phase A made the pillar REST-only EXCEPT for the wire surfaces
 * sibling pillars / the pillar SDK still call with no REST replacement: the
 * `/trpc` mount now serves only `core.registry.*`, `core.settings.*` and
 * `core.users.get` (see `router.ts` for the per-procedure rationale).
 *
 * Kept as a factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 */
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { coreContract } from '../contract/rest.js';
import { type CoreApiDeps, makeRequestHandler } from './handlers.js';
import { createIdentityMiddleware } from './middleware/identity.js';
import { createExternalDeregisterHandler } from './modules/external-registry/deregister.js';
import { createExternalHeartbeatHandler } from './modules/external-registry/heartbeat.js';
import { createExternalRegisterHandler } from './modules/external-registry/register.js';
import { createRegistrySubscribeHandler } from './modules/registry/subscribe.js';
import { makeCoreRestHandlers } from './rest/handlers.js';
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

  // tRPC mount — the residual cross-pillar wire surface (`core.registry.*`,
  // `core.settings.*`, `core.users.get`). The other per-domain tRPC routers
  // were retired in Phase A; these stay because sibling pillars / the pillar
  // SDK call them and there is no REST replacement yet (see `router.ts`).
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: createCoreTrpcContextFactory(deps.coreDb.db),
    })
  );

  // Identity middleware (REST surface). Resolves the per-request principal
  // EXACTLY as the tRPC context factory does and stashes it on
  // `res.locals.principal`. It never rejects globally — per-route gating
  // (`userOnly` / `protected`) is enforced inside the handlers. Mounted
  // BEFORE `createExpressEndpoints` so every REST handler sees the principal.
  app.use(createIdentityMiddleware(deps.coreDb.db));

  // ts-rest REST surface (core REST migration). Mounted root-relative
  // (e.g. `/entities`) AFTER the raw routes and the `/trpc` mount. This is
  // the canonical wire surface for every domain; the only tRPC procedures
  // still served are the cross-pillar residue (`core.registry.*`,
  // `core.settings.*`, `core.users.get`).
  createExpressEndpoints(coreContract, makeCoreRestHandlers(deps), app);

  return app;
}
