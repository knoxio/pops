/**
 * tRPC initialisation for the core pillar container.
 *
 * Phase A retired the per-domain tRPC routers EXCEPT the surfaces that
 * sibling pillars / the pillar SDK still call over the wire with no REST
 * replacement (see `router.ts` for the full rationale):
 *   - `core.registry.*`            (SDK discovery transport)
 *   - `core.settings.*`            (cross-pillar server SDK: media, finance)
 *   - `core.users.get`             (finance cron via the SDK)
 *
 * `core.settings.*` / `core.users.get` are `protectedProcedure`;
 * `core.registry.*` is `publicProcedure`. The `userOnlyProcedure` gate was
 * dropped with the service-accounts tRPC router (now REST-only via
 * `requireUser` in `middleware/identity.ts`).
 *
 * The core DB handle is injected at context-creation time via the
 * factory in `createCoreTrpcContextFactory` so tests can swap in an
 * in-memory handle without touching env vars or the production resolver.
 */
import { initTRPC, TRPCError } from '@trpc/server';

import {
  type AuthenticatedServiceAccount,
  type CoreDb,
  serviceAccountKeys,
  serviceAccountsService,
} from '../db/index.js';
import { verifyCloudflareJWT } from './middleware/cloudflare-jwt.js';

import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export interface User {
  email: string;
}

export interface Context {
  user: User | null;
  serviceAccount: AuthenticatedServiceAccount | null;
  coreDb: CoreDb;
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

/**
 * Build a tRPC context factory bound to a specific core DB handle.
 *
 * Production wires this at boot from `openCoreDb(resolveCoreSqlitePath())`;
 * tests pass in an in-memory handle so each suite is hermetic.
 */
export function createCoreTrpcContextFactory(
  coreDb: CoreDb
): (opts: CreateExpressContextOptions) => Promise<Context> {
  return async ({ req }: CreateExpressContextOptions): Promise<Context> => {
    const serviceAccount = await tryServiceAccountAuth(coreDb, req);
    if (serviceAccount) {
      return { user: null, serviceAccount, coreDb };
    }

    if (process.env['NODE_ENV'] !== 'production') {
      return {
        user: { email: 'dev@example.com' },
        serviceAccount: null,
        coreDb,
      };
    }

    if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) {
      return {
        user: { email: 'tunnel-authenticated@pops.local' },
        serviceAccount: null,
        coreDb,
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
        };
      } catch (error) {
        console.error('[core-api] JWT verification failed:', error);
        return { user: null, serviceAccount: null, coreDb };
      }
    }

    return { user: null, serviceAccount: null, coreDb };
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
      },
    });
  }

  throw new TRPCError({
    code: 'UNAUTHORIZED',
    message: 'Missing or invalid credentials (expected Cloudflare Access JWT or X-API-Key)',
  });
});
