/**
 * Express app factory for the media pillar container.
 *
 * Hosts the minimal `/health` + `/pillars` probes plus the pillar's REST
 * surface generated from `src/contract/rest.ts` via ts-rest. Kept as a
 * factory so the test suite can spin up an in-process `supertest` instance
 * without binding a real port.
 *
 * The pillar trusts the docker network — the dispatcher/gateway in front
 * authenticates; there is no per-request auth here (parity with lists /
 * inventory / finance / food).
 *
 * The `/media/images` byte route (served from `MEDIA_IMAGES_DIR`) is mounted
 * by a later slice; it is intentionally NOT part of the ts-rest contract.
 */
import { createExpressEndpoints } from '@ts-rest/express';
import express, { type Express, type Request, type Response } from 'express';

import { mediaContract } from '../contract/rest.js';
import { type MediaApiDeps, makeRequestHandler } from './handlers.js';
import { makeMediaRestHandlers } from './rest/handlers.js';

/**
 * JSON body cap. Poster-override uploads arrive as base64 strings in the
 * body; the limit sits well above express's 100 kb default so those
 * requests aren't rejected.
 */
const JSON_BODY_LIMIT = '20mb';

export function createMediaApiApp(deps: MediaApiDeps): Express {
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

  createExpressEndpoints(mediaContract, makeMediaRestHandlers(deps), app);

  return app;
}
