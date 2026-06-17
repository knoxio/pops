import { createExpressMiddleware } from '@trpc/server/adapters/express';
import express, { type RequestHandler } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { createOpenApiExpressMiddleware } from 'trpc-to-openapi';

import { authMiddleware } from './middleware/auth.js';
import { envContextMiddleware } from './middleware/env-context.js';
import { rateLimiter } from './middleware/rate-limit.js';
import { envRouter } from './modules/core/envs/router.js';
import { readInstalledModules } from './modules/env-modules.js';
import { openApiDocument } from './openapi.js';
import { appRouter } from './router.js';
import cerebrumQueryStreamRouter from './routes/cerebrum/query-stream.js';
import egoChatStreamRouter from './routes/ego/chat-stream.js';
import healthRouter from './routes/health.js';
import inventoryDocumentFilesRouter from './routes/inventory/document-files.js';
import documentThumbnailRouter from './routes/inventory/documents.js';
import inventoryPhotosRouter from './routes/inventory/photos.js';
import mediaImagesRouter from './routes/media/images.js';
import pillarsRouter from './routes/pillars.js';
import upBankRouter from './routes/webhooks/up-bank.js';
import { getRuntimeAppRouter } from './runtime/index.js';
import { createContext } from './trpc.js';

import type { AnyRouter } from '@trpc/server';

/**
 * Create and configure the Express application.
 * Exported separately from the server for testing.
 */
export function createApp(): express.Express {
  // PRD-100: validate POPS_APPS / POPS_OVERLAYS at boot. Throws on
  // unknown ids or footgun values like only-commas. Result is cached
  // for the rest of the process.
  readInstalledModules();

  const app = express();

  // Security headers
  app.use(helmet());

  // Rate limiting
  app.use(rateLimiter);

  // Webhook route needs raw body for signature verification — MUST come before express.json()
  // because body parsers consume the stream; once json() runs, raw() sees an empty body.
  app.use('/webhooks/up', express.raw({ type: 'application/json' }));

  // JSON body parsing for all other routes (env CRUD, tRPC).
  // Intentionally placed AFTER the raw webhook registration above.
  app.use(express.json());

  // Health check — no request body needed, placed after security/parsing for consistency
  // (moving it before express.json() would be safe but creates confusion about ordering).
  app.use(healthRouter);

  // Up Bank webhook handler (processes its own raw body + signature verification)
  app.use(upBankRouter);

  // Media image serving — static file serving, no DB needed
  app.use(mediaImagesRouter);

  // Document thumbnail proxy — proxies Paperless-ngx thumbnails
  app.use(documentThumbnailRouter);

  // Inventory photo serving — static files from INVENTORY_IMAGES_DIR.
  // Placed before authMiddleware so <img> tags can render without JWT cookies.
  app.use(inventoryPhotosRouter);

  // Inventory document upload serving — static files from INVENTORY_DOCUMENTS_DIR.
  // Placed before authMiddleware so download links open without JWT cookies.
  app.use(inventoryDocumentFilesRouter);

  // Cloudflare Access JWT auth — validates cf-access-jwt-assertion header.
  // Placed after health/webhook/media routes (those skip auth or use their own).
  // In development, bypasses JWT check and attaches mock user.
  app.use(authMiddleware);

  // Pillar registry HTTP surface (ADR-026 P2): POST /uri/resolve, GET /pillars.
  // Both endpoints expose deployment topology / object data, so they sit
  // behind authMiddleware. Inter-pillar HTTP between sibling pillars (a
  // future concern — no other pillars exist yet) will need a service-token
  // auth mechanism layered on top; gating these routes now ensures they
  // never go public during the pre-flight window.
  app.use(pillarsRouter);

  // Env CRUD routes — mounted before env context middleware so these always
  // use the prod DB regardless of any ?env= query param on the request.
  app.use(envRouter);

  // Env context middleware — reads ?env=NAME, validates the env, and scopes
  // the DB connection for all downstream handlers (tRPC, webhooks, etc.).
  app.use(envContextMiddleware);

  // Ego SSE streaming — POST /api/ego/chat/stream
  // Placed after auth + env context so the user is authenticated and the DB is scoped.
  app.use(egoChatStreamRouter);

  // Cerebrum Query SSE streaming — POST /api/cerebrum/query/stream (PRD-082, issue #2596).
  app.use(cerebrumQueryStreamRouter);

  // OpenAPI spec endpoint
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiDocument);
  });

  // Swagger UI — serves the interactive API docs
  app.use('/api/docs', ...swaggerUi.serve, swaggerUi.setup(openApiDocument, { explorer: true }));

  // OpenAPI REST handler — mounted after auth; tRPC remains primary for the
  // React frontend. The OpenAPI surface is statically typed at boot from the
  // in-repo router; external (PRD-228) pillars are not OpenAPI-documented, so
  // this consumer continues to read from the static export.
  app.use(
    '/api/v1',
    createOpenApiExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // tRPC handler — reads the runtime router holder per request so external
  // pillars registered after boot (PRD-228) become reachable without a
  // restart. The static `appRouter` import above stays the type source for
  // in-repo clients; the runtime accessor wraps it with the merged externals.
  app.use('/trpc', createDynamicTrpcMiddleware());

  return app;
}

/**
 * Build a tRPC express middleware that resolves the live router per request
 * via `getRuntimeAppRouter()`. The underlying `createExpressMiddleware`
 * closes over its `router` argument, so we re-create the inner handler when
 * the runtime router reference changes (recompose). Strict identity check
 * keeps the per-request overhead at one pointer compare in the steady state.
 */
function createDynamicTrpcMiddleware(): RequestHandler {
  let lastRouter: AnyRouter | null = null;
  let cached: RequestHandler | null = null;
  return (req, res, next) => {
    const current = getRuntimeAppRouter();
    if (current !== lastRouter || cached === null) {
      lastRouter = current;
      cached = createExpressMiddleware({ router: current, createContext });
    }
    cached(req, res, next);
  };
}
