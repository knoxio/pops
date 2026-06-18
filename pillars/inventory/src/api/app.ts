/**
 * Express app factory for the inventory pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 *
 * The pillar trusts the docker network — the dispatcher/gateway in front
 * authenticates; there is no per-request auth here (parity with lists).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { inventoryContract } from '../contract/rest.js';
import { createInventoryFilesRouter } from './files/router.js';
import { type InventoryApiDeps, makeRequestHandler } from './handlers.js';
import { makeInventoryRestHandlers } from './rest/handlers.js';

/**
 * JSON body cap. Photo / document uploads arrive as base64 strings in the
 * body; a 10 MiB file is ~13.7 MB of base64, so the limit sits above that
 * (express defaults to 100 kb, which would reject every upload).
 */
const JSON_BODY_LIMIT = '20mb';

/**
 * The committed OpenAPI projection (`pillars/inventory/openapi/inventory.openapi.json`),
 * served verbatim at `GET /openapi` so the pillar SDK can build its route map
 * from the live pillar rather than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/inventory.openapi.json` lands
 * at the package root in BOTH layouts: `src/api/app.ts` (dev) and
 * `dist/api/app.js` (prod, `outDir: dist` / `rootDir: src`), since `openapi/`
 * is a sibling of both `src/` and `dist/`.
 *
 * This is a RAW route, NOT a ts-rest contract route, so it does not appear in
 * the generated document (`generate:openapi` is a pure projection of the
 * contract) — no drift. Read once at module load: the file is static.
 */
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'inventory.openapi.json'),
    'utf8'
  )
);

export function createInventoryApiApp(deps: InventoryApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

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

  createExpressEndpoints(inventoryContract, makeInventoryRestHandlers(deps), app);

  // Raw (non-ts-rest) byte-serving routes for item photos, direct-upload docs,
  // and the Paperless thumbnail proxy. Mounted after the contract endpoints;
  // their `/api/inventory/...` + `/inventory/documents/:id/thumbnail` paths
  // don't collide with any contract path, so they add no OpenAPI surface.
  app.use(createInventoryFilesRouter());

  return app;
}
