/**
 * tRPC initialisation for the finance pillar container.
 *
 * Mirrors the auth surface of `apps/pops-api/src/trpc.ts` (and the local
 * copies in `apps/pops-core-api/src/trpc.ts` + `apps/pops-inventory-api/src/trpc.ts`)
 * but trims what finance-api doesn't need yet:
 *   - no module gate (per-pillar containers serve a single pillar by
 *     definition; the install-set check lives at the dispatcher layer
 *     above this process);
 *   - no `internalProcedure` (no sibling-process callers for finance
 *     yet);
 *   - no OpenAPI meta (the dispatcher/gateway owns OpenAPI; finance-api
 *     handlers are tRPC-only for now).
 *
 * The finance DB handle is injected at context-creation time via the
 * factory in `createFinanceTrpcContextFactory` so tests can swap in
 * an in-memory handle without touching env vars or the production
 * resolver. The optional `coreDb` handle is what powers service-account
 * authentication and scope checks; production wires it from the shared
 * `core.db` volume so `protectedProcedure` keeps accepting machine
 * principals byte-identically to the legacy pops-api router. Tests that
 * don't exercise service-account auth can omit it — `protectedProcedure`
 * will fall back to UNAUTHORIZED for any caller without a user.
 */
import { initTRPC, TRPCError } from '@trpc/server';

import {
  type AuthenticatedServiceAccount,
  type CoreDb,
  serviceAccountKeys,
  serviceAccountsService,
} from '@pops/core-db';
import { type FinanceDb } from '@pops/finance-db';

import { verifyCloudflareJWT } from './middleware/cloudflare-jwt.js';

import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export interface User {
  email: string;
}

export interface Context {
  user: User | null;
  serviceAccount: AuthenticatedServiceAccount | null;
  financeDb: FinanceDb;
}

function readApiKeyHeader(req: CreateExpressContextOptions['req']): string | null {
  const raw = req.headers['x-api-key'];
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

async function tryServiceAccountAuth(
  coreDb: CoreDb | null,
  req: CreateExpressContextOptions['req']
): Promise<AuthenticatedServiceAccount | null> {
  if (!coreDb) return null;
  const header = readApiKeyHeader(req);
  if (!header) return null;
  const parsed = serviceAccountKeys.parseApiKey(header);
  if (!parsed) return null;
  return serviceAccountsService.authenticateServiceAccount(coreDb, parsed.prefix, parsed.secret);
}

export interface FinanceTrpcContextFactoryDeps {
  financeDb: FinanceDb;
  /**
   * Optional core DB handle used to authenticate `X-API-Key` callers.
   * When omitted, service-account auth is disabled and only Cloudflare
   * Access (or the dev/tunnel fallbacks) is honoured. Production wires
   * this from the shared `core.db` volume; tests typically leave it
   * undefined unless they specifically exercise SA paths.
   */
  coreDb?: CoreDb;
}

/**
 * Build a tRPC context factory bound to specific DB handles.
 */
export function createFinanceTrpcContextFactory(
  deps: FinanceTrpcContextFactoryDeps
): (opts: CreateExpressContextOptions) => Promise<Context> {
  const coreDb = deps.coreDb ?? null;
  return async ({ req }: CreateExpressContextOptions): Promise<Context> => {
    const serviceAccount = await tryServiceAccountAuth(coreDb, req);
    if (serviceAccount) {
      return { user: null, serviceAccount, financeDb: deps.financeDb };
    }

    if (process.env['NODE_ENV'] !== 'production') {
      return {
        user: { email: 'dev@example.com' },
        serviceAccount: null,
        financeDb: deps.financeDb,
      };
    }

    if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) {
      return {
        user: { email: 'tunnel-authenticated@pops.local' },
        serviceAccount: null,
        financeDb: deps.financeDb,
      };
    }

    const token = req.headers['cf-access-jwt-assertion'];
    if (typeof token === 'string') {
      try {
        const payload = await verifyCloudflareJWT(token);
        return {
          user: { email: payload.email },
          serviceAccount: null,
          financeDb: deps.financeDb,
        };
      } catch (error) {
        console.error('[finance-api] JWT verification failed:', error);
        return { user: null, serviceAccount: null, financeDb: deps.financeDb };
      }
    }

    return { user: null, serviceAccount: null, financeDb: deps.financeDb };
  };
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        /** i18n key for frontend translation lookup — mirrors pops-api's wire shape. */
        messageKey:
          error.cause instanceof Error && 'messageKey' in error.cause
            ? (error.cause as { messageKey?: string }).messageKey
            : undefined,
      },
    };
  },
});

export const router = t.router;

export const publicProcedure = t.procedure;

/**
 * Protected procedure that requires either a Cloudflare Access user OR
 * an authenticated service account whose granted scopes cover the
 * procedure path. Mirrors the semantics of `protectedProcedure` in
 * `apps/pops-api/src/trpc.ts` so the writer-move is wire-compatible.
 */
export const protectedProcedure = t.procedure.use(({ ctx, path, next }) => {
  if (ctx.user) {
    return next({
      ctx: {
        user: ctx.user,
        serviceAccount: ctx.serviceAccount,
        financeDb: ctx.financeDb,
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
        financeDb: ctx.financeDb,
      },
    });
  }

  throw new TRPCError({
    code: 'UNAUTHORIZED',
    message: 'Missing or invalid credentials (expected Cloudflare Access JWT or X-API-Key)',
  });
});
