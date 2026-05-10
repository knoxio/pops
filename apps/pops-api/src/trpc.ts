/**
 * tRPC initialization, context, and base procedures.
 * All tRPC routers extend from the procedures defined here.
 */
import { initTRPC, TRPCError } from '@trpc/server';

import { verifyCloudflareJWT } from './middleware/cloudflare-jwt.js';
import { parseApiKey } from './modules/core/service-accounts/key.js';
import {
  authenticateServiceAccount,
  hasScopeFor,
  type AuthenticatedServiceAccount,
} from './modules/core/service-accounts/service.js';
import { KNOWN_APPS, KNOWN_OVERLAYS, readInstalledModules } from './modules/env-modules.js';

import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type { OpenApiMeta } from 'trpc-to-openapi';

/**
 * User context extracted from Cloudflare Access JWT
 */
export interface User {
  email: string;
}

/**
 * tRPC context available in all procedures.
 *
 * Either `user` (browser session via Cloudflare Access) or `serviceAccount`
 * (machine client via `X-API-Key`) may be set; never both. `protectedProcedure`
 * accepts either; `serviceAccountProcedure` requires the service-account form;
 * routes that need a human session can branch on `ctx.user`.
 */
export interface Context {
  user: User | null;
  serviceAccount: AuthenticatedServiceAccount | null;
}

function readApiKeyHeader(req: CreateExpressContextOptions['req']): string | null {
  const raw = req.headers['x-api-key'];
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

async function tryServiceAccountAuth(
  req: CreateExpressContextOptions['req']
): Promise<AuthenticatedServiceAccount | null> {
  const header = readApiKeyHeader(req);
  if (!header) return null;
  const parsed = parseApiKey(header);
  if (!parsed) return null;
  return authenticateServiceAccount(parsed.prefix, parsed.secret);
}

/**
 * Create tRPC context from Express request.
 *
 * Order of operations:
 *   1. If `X-API-Key` is presented and verifies, treat the call as a
 *      service-account call. The user field stays null — service accounts
 *      do not impersonate humans.
 *   2. Otherwise validate the Cloudflare Access JWT (or use the dev /
 *      tunnel-trust shortcuts).
 */
export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  const serviceAccount = await tryServiceAccountAuth(req);
  if (serviceAccount) {
    return { user: null, serviceAccount };
  }

  // In development, skip JWT validation and use mock user
  if (process.env['NODE_ENV'] !== 'production') {
    return {
      user: {
        email: 'dev@example.com',
      },
      serviceAccount: null,
    };
  }

  // If Cloudflare Access team name is not configured, trust the tunnel
  if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) {
    return {
      user: { email: 'tunnel-authenticated@pops.local' },
      serviceAccount: null,
    };
  }

  const token = req.headers['cf-access-jwt-assertion'];

  if (typeof token === 'string') {
    try {
      const payload = await verifyCloudflareJWT(token);
      return {
        user: {
          email: payload.email,
        },
        serviceAccount: null,
      };
    } catch (error) {
      console.error('[trpc] JWT verification failed:', error);
      return { user: null, serviceAccount: null };
    }
  }

  return { user: null, serviceAccount: null };
}

export type ContextType = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC
  .context<Context>()
  .meta<OpenApiMeta>()
  .create({
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          /** i18n key for frontend translation lookup. */
          messageKey:
            error.cause instanceof Error && 'messageKey' in error.cause
              ? (error.cause as { messageKey: string }).messageKey
              : undefined,
        },
      };
    },
  });

/** Base router for composing routers. */
export const router = t.router;

/** Merge multiple routers into a single router. */
export const mergeRouters = t.mergeRouters;

/**
 * Optional domain modules — gated by `POPS_APPS` / `POPS_OVERLAYS` (PRD-100).
 * `core` is always installed. The router id sets derive directly from
 * `KNOWN_APPS` / `KNOWN_OVERLAYS` so this stays in sync with the env contract
 * — adding a new known app there automatically extends the gate.
 */
const OPTIONAL_APP_ROUTERS: ReadonlySet<string> = new Set(KNOWN_APPS);
const OVERLAY_ROUTERS: ReadonlySet<string> = new Set(KNOWN_OVERLAYS);

const moduleGate = t.middleware(({ path, next }) => {
  const top = path.split('.')[0] ?? '';
  const isApp = OPTIONAL_APP_ROUTERS.has(top);
  const isOverlay = OVERLAY_ROUTERS.has(top);
  if (!isApp && !isOverlay) return next();

  const installed = readInstalledModules();
  const set = new Set<string>(isApp ? installed.apps : installed.overlays);
  if (!set.has(top)) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Module '${top}' is not installed in this deployment.`,
    });
  }
  return next();
});

/** Base procedure for all endpoints (no auth required). */
export const publicProcedure = t.procedure.use(moduleGate);

/**
 * Protected procedure that requires either a Cloudflare Access user OR an
 * authenticated service account whose granted scopes cover the procedure
 * path. Browser sessions retain full access (their granted scope is
 * implicit); service-account calls must enumerate explicit scope prefixes
 * at key creation time.
 */
export const protectedProcedure = t.procedure.use(moduleGate).use(({ ctx, path, next }) => {
  if (ctx.user) {
    return next({
      ctx: {
        user: ctx.user,
        serviceAccount: ctx.serviceAccount,
      },
    });
  }

  if (ctx.serviceAccount) {
    if (!hasScopeFor(ctx.serviceAccount.scopes, path)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Service account '${ctx.serviceAccount.name}' is not authorised for '${path}'`,
      });
    }
    return next({
      ctx: {
        user: ctx.user,
        serviceAccount: ctx.serviceAccount,
      },
    });
  }

  throw new TRPCError({
    code: 'UNAUTHORIZED',
    message: 'Missing or invalid credentials (expected Cloudflare Access JWT or X-API-Key)',
  });
});

/**
 * Procedure that requires a human (browser session) caller. Use this for
 * routes that mint API keys, edit settings on behalf of an operator, or
 * otherwise should never be reachable from a service-account principal.
 */
export const userOnlyProcedure = t.procedure.use(moduleGate).use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'This endpoint requires a Cloudflare Access user session.',
    });
  }
  return next({
    ctx: {
      user: ctx.user,
      serviceAccount: ctx.serviceAccount,
    },
  });
});
