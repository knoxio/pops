/**
 * Express app factory for the finance pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 *
 * The pillar trusts the docker network — the dispatcher/gateway in front
 * authenticates; there is no per-request auth here (parity with lists /
 * inventory / food).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { financeContract } from '../contract/rest.js';
import { type FinanceApiDeps, makeRequestHandler } from './handlers.js';
import { makeFinanceRestHandlers } from './rest/handlers.js';
import { createUpBankWebhookRouter } from './webhooks/up-bank.js';

/**
 * JSON body cap. Statement-import uploads will arrive as base64 strings in
 * the body once that domain lands; the limit sits well above express's
 * 100 kb default so those requests aren't rejected.
 */
const JSON_BODY_LIMIT = '20mb';

/**
 * The committed OpenAPI projection (`pillars/finance/openapi/finance.openapi.json`),
 * served verbatim at `GET /openapi` so the pillar SDK can build its route map
 * from the live pillar rather than a vendored copy.
 *
 * Resolved relative to this module — `../../openapi/finance.openapi.json` lands
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
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'finance.openapi.json'),
    'utf8'
  )
);

export function createFinanceApiApp(deps: FinanceApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Up Bank signs the raw request bytes, so the webhook body must reach the
  // handler unparsed. The path-scoped raw parser MUST precede the global JSON
  // parser, which would otherwise consume the stream first.
  app.use('/webhooks/up', express.raw({ type: 'application/json' }));
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

  createExpressEndpoints(financeContract, makeFinanceRestHandlers(deps), app);

  // Raw (non-ts-rest) webhook route. Mounted after the contract endpoints; its
  // `/webhooks/up` paths don't collide with any contract path, so it adds no
  // OpenAPI surface.
  app.use(createUpBankWebhookRouter());

  return app;
}
