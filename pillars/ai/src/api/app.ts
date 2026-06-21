/**
 * Express app factory for the ai pillar container.
 *
 * Serves the ts-rest `aiContract` surface (mounted via `createExpressEndpoints`)
 * plus the raw `/health`, `/pillars`, and `/openapi` routes ts-rest cannot
 * model. The cross-pillar ingest `POST /ai-usage/record` is internal-only: the
 * {@link INTERNAL_PATHS} gate 403s any request to it without a matching
 * `x-pops-internal-token` (nginx never proxies it either). `/ai-pricing/*` is
 * NOT internal — cross-pillar callers fetch it to shape pricing before
 * `computeCostUsd`.
 *
 * Kept as a factory so the test suite can spin up an in-process `supertest`
 * instance without binding a real port.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

import { aiContract } from '../contract/rest.js';
import { type AiApiDeps, makeRequestHandler } from './handlers.js';
import { makeAiRestHandlers } from './rest/handlers.js';

/**
 * Paths that trust ONLY the internal token, never the docker network. The
 * cross-pillar telemetry sink is the sole entry today; nginx does not proxy it,
 * so the only reachable callers are sibling pillars carrying the shared token.
 */
const INTERNAL_PATHS = new Set(['/ai-usage/record']);

function requireInternalToken(req: Request, res: Response, next: NextFunction): void {
  if (!INTERNAL_PATHS.has(req.path)) {
    next();
    return;
  }
  const expected = process.env['POPS_API_INTERNAL_TOKEN'];
  // `req.get` normalises a possibly-repeated header to a single string so a
  // client sending the token more than once (→ `string[]`) is not spuriously
  // rejected.
  const presented = req.get('x-pops-internal-token');
  if (expected === undefined || presented !== expected) {
    res.status(403).json({ message: 'Forbidden' });
    return;
  }
  next();
}

/**
 * The committed OpenAPI projection (`pillars/ai/openapi/ai.openapi.json`),
 * served verbatim at `GET /openapi`. Resolved relative to this module —
 * `../../openapi/ai.openapi.json` lands at the package root in BOTH layouts
 * (`src/api/app.ts` dev, `dist/api/app.js` prod), since `openapi/` is a sibling
 * of both `src/` and `dist/`. RAW route, NOT a ts-rest contract route, so it
 * never appears in the generated document — no drift.
 */
const openapiDocument: unknown = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'openapi', 'ai.openapi.json'),
    'utf8'
  )
);

export function createAiApiApp(deps: AiApiDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));
  app.use(requireInternalToken);

  const handlers = makeRequestHandler(deps);

  app.get('/health', (_req: Request, res: Response) => {
    res.json(handlers.health());
  });

  app.get('/pillars', (_req: Request, res: Response) => {
    res.json(handlers.pillars());
  });

  app.get('/openapi', (_req: Request, res: Response) => {
    res.json(openapiDocument);
  });

  createExpressEndpoints(aiContract, makeAiRestHandlers(deps), app);

  return app;
}
