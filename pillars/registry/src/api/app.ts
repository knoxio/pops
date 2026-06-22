/**
 * Express app factory for the core pillar container.
 *
 * The pillar is fully REST: the ts-rest `coreContract` surface (mounted via
 * `createExpressEndpoints`) plus the handful of raw HTTP/SSE routes the
 * registry needs and ts-rest cannot model — `GET /pillars`, `GET /pillars/health`,
 * `POST /uri/resolve`, the SSE `GET /registry/subscribe`, the DB-backed
 * discovery snapshot, and the raw register/heartbeat/deregister mutations. The
 * pillar serves no tRPC.
 *
 * Registry handshake/discovery paths are DUAL-SERVED during the dot-routes →
 * slash rolling-deploy window: each operation is mounted on its canonical slash
 * path (`GET /registry/pillars`, `POST /registry/{register,heartbeat,
 * deregister}` — {@link REGISTRY_PATHS}) AND on the legacy dotted path
 * (`GET /core.registry.list`, `POST /core.registry.{register,heartbeat,
 * deregister}` — {@link LEGACY_REGISTRY_PATHS}), both pointing at the SAME
 * handler instance. The legacy aliases let an old-SDK pillar keep registering
 * against a new core; they are removed in a later release once the
 * legacy-path-hit metric reads zero everywhere.
 *
 * Kept as a factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { LEGACY_REGISTRY_PATHS, REGISTRY_PATHS } from '@pops/pillar-sdk';

import { coreContract } from '../contract/rest.js';
import { type CoreApiDeps, makeRequestHandler } from './handlers.js';
import { createIdentityMiddleware } from './middleware/identity.js';
import { createExternalDeregisterHandler } from './modules/external-registry/deregister.js';
import { createExternalHeartbeatHandler } from './modules/external-registry/heartbeat.js';
import { createExternalRegisterHandler } from './modules/external-registry/register.js';
import { makeLegacyPathMetric } from './modules/registry/legacy-path-metric.js';
import { createRegistrySnapshotHandler } from './modules/registry/snapshot.js';
import { createRegistrySubscribeHandler } from './modules/registry/subscribe.js';
import { makeCoreRestHandlers } from './rest/handlers.js';

import type { CoreDb } from '../db/index.js';

/**
 * The committed OpenAPI projection
 * (`pillars/registry/openapi/registry.openapi.json`), served verbatim at
 * `GET /openapi` so the pillar SDK can build its route map from the live
 * pillar rather than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/registry.openapi.json`
 * lands at the package root in BOTH layouts: `src/api/app.ts` (dev) and
 * `dist/api/app.js` (prod, `outDir: dist` / `rootDir: src`), since `openapi/`
 * is a sibling of both `src/` and `dist/`. Mirrors `db/open-core-db.ts`'s
 * `../../migrations` resolve.
 *
 * This is a RAW route, NOT a ts-rest contract route, so it does not appear in
 * the generated document (`generate:openapi` is a pure projection of the
 * contract) — no drift. Read once at module load: the file is static.
 */
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'registry.openapi.json'),
    'utf8'
  )
);

/**
 * Mount the registry handshake/discovery routes, DUAL-SERVED on the canonical
 * slash path and the legacy dotted alias during the rolling-deploy window.
 *
 * Each handler is created once and shared by both paths (no logic duplication);
 * `legacyHit` is a pass-through metric mounted in front of both that fires only
 * on the dotted alias. Raw HTTP (not ts-rest / not tRPC): the snapshot returns
 * the bare `{ pillars, fetchedAt }` shape the pillar SDK's
 * `HttpDiscoveryTransport` reads.
 */
function mountRegistryRoutes(app: Express, db: CoreDb): void {
  const snapshotHandler = createRegistrySnapshotHandler(db);
  const registerHandler = createExternalRegisterHandler({ coreDb: db });
  const heartbeatHandler = createExternalHeartbeatHandler({ coreDb: db });
  const deregisterHandler = createExternalDeregisterHandler({ coreDb: db });
  const legacyHit = makeLegacyPathMetric();

  for (const path of [REGISTRY_PATHS.snapshot, LEGACY_REGISTRY_PATHS.snapshot])
    app.get(path, legacyHit, snapshotHandler);
  for (const path of [REGISTRY_PATHS.register, LEGACY_REGISTRY_PATHS.register])
    app.post(path, legacyHit, registerHandler);
  for (const path of [REGISTRY_PATHS.heartbeat, LEGACY_REGISTRY_PATHS.heartbeat])
    app.post(path, legacyHit, heartbeatHandler);
  for (const path of [REGISTRY_PATHS.deregister, LEGACY_REGISTRY_PATHS.deregister])
    app.post(path, legacyHit, deregisterHandler);
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

  // Self-describing OpenAPI surface. Serves the committed projection verbatim
  // so a sibling pillar / the pillar SDK can build its operationId route map
  // against the live pillar. Raw route — intentionally NOT a ts-rest contract
  // route, so it never appears in the generated document.
  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  // Cross-pillar URI dispatcher (ADR-026 P2). Raw HTTP: pillars POST
  // `{ uri }` here and core resolves in-process or proxies to the owning
  // pillar. The remote leg routes off the live DB registry, falling back to
  // the `POPS_PILLARS` seed. Never throws — every error path is a typed
  // `UriResolverResult`.
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

  mountRegistryRoutes(app, deps.coreDb.db);

  // Identity middleware (REST surface). Resolves the per-request principal
  // (`x-pops-user` from the dispatcher / `x-api-key` service accounts) and
  // stashes it on `res.locals.principal`. It never rejects globally —
  // per-route gating (`userOnly` / `protected`) is enforced inside the
  // handlers. Mounted BEFORE `createExpressEndpoints` so every REST handler
  // sees the principal.
  app.use(createIdentityMiddleware(deps.coreDb.db));

  // ts-rest REST surface — the canonical wire for every domain. Mounted
  // root-relative (e.g. `/settings/:key`, `/users`) AFTER the raw
  // registry routes. This is the only contract surface; the pillar serves no
  // tRPC.
  createExpressEndpoints(coreContract, makeCoreRestHandlers(deps), app);

  return app;
}
