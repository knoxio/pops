/**
 * tRPC initialisation for the cerebrum pillar container.
 *
 * Mirrors the auth surface of `apps/pops-api/src/trpc.ts` but trims off
 * what cerebrum-api doesn't need yet:
 *   - no module gate (per-pillar containers serve a single pillar by
 *     definition; the install-set check lives at the dispatcher layer
 *     above this process);
 *   - no `internalProcedure` (no sibling-process callers yet);
 *   - no OpenAPI meta (the dispatcher/gateway owns OpenAPI; cerebrum-api
 *     handlers are tRPC-only for now).
 *
 * Service-account authentication still reads from `core.db` because the
 * canonical `service_accounts` table lives on the core pillar. The
 * cerebrum-owned handle is exposed on `ctx.cerebrumDb` for the nudge_log
 * router; both handles are injected at context-creation time via the
 * factory in `createCerebrumTrpcContextFactory` so tests can swap in
 * in-memory handles without touching env vars or the production resolver.
 */
import { initTRPC, TRPCError } from '@trpc/server';

import {
  type AuthenticatedServiceAccount,
  type CoreDb,
  serviceAccountKeys,
  serviceAccountsService,
} from '@pops/core-db';

import { verifyCloudflareJWT } from './middleware/cloudflare-jwt.js';

import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

import type { CerebrumDb } from '@pops/cerebrum-db';

export interface User {
  email: string;
}

export interface Context {
  user: User | null;
  serviceAccount: AuthenticatedServiceAccount | null;
  coreDb: CoreDb;
  cerebrumDb: CerebrumDb;
}

function readApiKeyHeader(req: CreateExpressContextOptions['req']): string | null {
  const raw = req.headers['x-api-key'];
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

async function tryServiceAccountAuth(
  coreDb: CoreDb,
  req: CreateExpressContextOptions['req']
): Promise<AuthenticatedServiceAccount | null> {
  const header = readApiKeyHeader(req);
  if (!header) return null;
  const parsed = serviceAccountKeys.parseApiKey(header);
  if (!parsed) return null;
  return serviceAccountsService.authenticateServiceAccount(coreDb, parsed.prefix, parsed.secret);
}

export interface CerebrumTrpcDeps {
  coreDb: CoreDb;
  cerebrumDb: CerebrumDb;
}

/**
 * Build a tRPC context factory bound to a specific pair of DB handles.
 *
 * Production wires this at boot from `openCerebrumDb(...)` + `openCoreDb(...)`;
 * tests pass in-memory handles so each suite is hermetic.
 */
export function createCerebrumTrpcContextFactory(
  deps: CerebrumTrpcDeps
): (opts: CreateExpressContextOptions) => Promise<Context> {
  const { coreDb, cerebrumDb } = deps;
  return async ({ req }: CreateExpressContextOptions): Promise<Context> => {
    const serviceAccount = await tryServiceAccountAuth(coreDb, req);
    if (serviceAccount) {
      return { user: null, serviceAccount, coreDb, cerebrumDb };
    }

    if (process.env['NODE_ENV'] !== 'production') {
      return {
        user: { email: 'dev@example.com' },
        serviceAccount: null,
        coreDb,
        cerebrumDb,
      };
    }

    if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) {
      return {
        user: { email: 'tunnel-authenticated@pops.local' },
        serviceAccount: null,
        coreDb,
        cerebrumDb,
      };
    }

    const token = req.headers['cf-access-jwt-assertion'];
    if (typeof token === 'string') {
      try {
        const payload = await verifyCloudflareJWT(token);
        return {
          user: { email: payload.email },
          serviceAccount: null,
          coreDb,
          cerebrumDb,
        };
      } catch (error) {
        console.error('[cerebrum-api] JWT verification failed:', error);
        return { user: null, serviceAccount: null, coreDb, cerebrumDb };
      }
    }

    return { user: null, serviceAccount: null, coreDb, cerebrumDb };
  };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, path, next }) => {
  if (ctx.user) {
    return next({
      ctx: {
        user: ctx.user,
        serviceAccount: ctx.serviceAccount,
        coreDb: ctx.coreDb,
        cerebrumDb: ctx.cerebrumDb,
      },
    });
  }

  if (ctx.serviceAccount) {
    if (!serviceAccountsService.hasScopeFor(ctx.serviceAccount.scopes, path)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Service account '${ctx.serviceAccount.name}' is not authorised for '${path}'`,
      });
    }
    return next({
      ctx: {
        user: ctx.user,
        serviceAccount: ctx.serviceAccount,
        coreDb: ctx.coreDb,
        cerebrumDb: ctx.cerebrumDb,
      },
    });
  }

  throw new TRPCError({
    code: 'UNAUTHORIZED',
    message: 'Missing or invalid credentials (expected Cloudflare Access JWT or X-API-Key)',
  });
});
