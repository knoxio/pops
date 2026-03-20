import express from "express";
import helmet from "helmet";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { rateLimiter } from "./middleware/rate-limit.js";
import { envContextMiddleware } from "./middleware/env-context.js";
import healthRouter from "./routes/health.js";
import upBankRouter from "./routes/webhooks/up-bank.js";
import { envRouter } from "./modules/core/envs/router.js";
import mediaImagesRouter from "./routes/media/images.js";
import { appRouter } from "./router.js";
import { createContext } from "./trpc.js";

/**
 * Create and configure the Express application.
 * Exported separately from the server for testing.
 */
export function createApp(): express.Express {
  const app = express();

  // Security headers
  app.use(helmet());

  // Rate limiting
  app.use(rateLimiter);

  // Webhook route needs raw body for signature verification — MUST come before express.json()
  // because body parsers consume the stream; once json() runs, raw() sees an empty body.
  app.use("/webhooks/up", express.raw({ type: "application/json" }));

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

  // Env CRUD routes — mounted before env context middleware so these always
  // use the prod DB regardless of any ?env= query param on the request.
  app.use(envRouter);

  // Env context middleware — reads ?env=NAME, validates the env, and scopes
  // the DB connection for all downstream handlers (tRPC, webhooks, etc.).
  app.use(envContextMiddleware);

  // tRPC handler (auth via context/procedures)
  app.use(
    "/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}
