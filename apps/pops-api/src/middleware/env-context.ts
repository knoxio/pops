/**
 * Env context middleware — routes tRPC requests to the correct SQLite database.
 *
 * If a request includes `?env=NAME`, the middleware looks up the named environment,
 * opens its SQLite connection, and runs the rest of the request pipeline inside
 * an AsyncLocalStorage scope so that `getDb()` in any service returns the env DB.
 *
 * Unknown or expired environments return 410 Gone.
 * Missing `?env` or `?env=prod` falls through to the prod DB (default behaviour).
 */
import type { NextFunction, Request, Response } from 'express';

import { withEnvDb } from '../db.js';
import { getEnvRecord, getOrOpenEnvDb } from '../modules/core/envs/registry.js';

export function envContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const envName = req.query['env'] as string | undefined;

  // No env param or explicitly prod → use default prod DB
  if (!envName || envName === 'prod') {
    next();
    return;
  }

  const record = getEnvRecord(envName);
  if (!record) {
    res.status(410).json({ error: `Environment '${envName}' not found or expired` });
    return;
  }

  const db = getOrOpenEnvDb(record);

  // Run the rest of the middleware chain within the env DB context.
  // AsyncLocalStorage.run() propagates the store through all async continuations
  // spawned within the callback — including awaited promises and microtasks.
  //
  // Limitation: code that escapes the async context (e.g. setTimeout with no
  // await, or fire-and-forget Promises that outlive the request) will NOT see
  // the env DB. This is acceptable here because:
  //  - tRPC handlers use async/await throughout — context propagates correctly.
  //  - Fire-and-forget background tasks started from within a handler (e.g.
  //    processImportWithProgress) inherit the env context via async_hooks, so
  //    getDb() and isNamedEnvContext() work correctly inside them.
  //  - Long-lived background jobs (TTL watcher) run outside any request context
  //    and always use the prod DB, which is the correct behaviour.
  withEnvDb(db, () => next());
}
