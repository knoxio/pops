/**
 * tRPC initialisation for the lists pillar's HTTP server.
 *
 * The pillar runs on the internal docker network behind nginx/pops-shell.
 * Authentication happens at the gateway layer (Cloudflare Access on the
 * shell, the `x-pops-internal-token` shared secret on sibling-process
 * calls). The pillar itself trusts upstream-authenticated requests —
 * stricter checks belong at the gateway, not duplicated here.
 *
 * Context:
 *   - `db` is the per-process lists drizzle handle, opened once at boot
 *     in `server.ts` via `openListsDb`. Procedures read/write through
 *     `ctx.db` instead of reaching for a module-level singleton.
 *   - `internalCaller` mirrors pops-api's PRD-125 contract: true when
 *     the request carries a valid `x-pops-internal-token`. Reserved
 *     for sibling-process callbacks; currently always set true on the
 *     pillar's internal network and tightened later.
 */
import { initTRPC } from '@trpc/server';

import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

import type { ListsDb } from '../db/index.js';

export interface Context {
  db: ListsDb;
  internalCaller: boolean;
}

export function createContextFactory(db: ListsDb): (opts: CreateExpressContextOptions) => Context {
  return ({ req }) => ({
    db,
    internalCaller: isInternalCall(req),
  });
}

function isInternalCall(req: CreateExpressContextOptions['req']): boolean {
  const expected = process.env['POPS_API_INTERNAL_TOKEN'];
  if (expected === undefined || expected.length === 0) return false;
  const presented = req.headers['x-pops-internal-token'];
  if (Array.isArray(presented)) return presented[0] === expected;
  return presented === expected;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Procedure available to any caller on the pillar's network. The HTTP
 * server is not exposed publicly; gateway auth gates access at the
 * network boundary.
 */
export const publicProcedure = t.procedure;

/**
 * Alias of `publicProcedure` for now. Currently identical because the
 * pillar trusts upstream-authenticated requests; kept as a separate
 * name so routers carrying user semantics are flagged for upgrade
 * when per-pillar identity arrives.
 */
export const protectedProcedure = t.procedure;
