/**
 * tRPC initialization, context, and base procedures.
 * All tRPC routers extend from the procedures defined here.
 */
import { initTRPC, TRPCError } from '@trpc/server';

import { verifyCloudflareJWT } from './middleware/cloudflare-jwt.js';
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
 * tRPC context available in all procedures
 */
export interface Context {
  user: User | null;
}

/**
 * Create tRPC context from Express request.
 * Validates Cloudflare Access JWT and extracts user info.
 * In development, bypasses JWT check for local testing.
 */
export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  // In development, skip JWT validation and use mock user
  if (process.env['NODE_ENV'] !== 'production') {
    return {
      user: {
        email: 'dev@example.com',
      },
    };
  }

  // If Cloudflare Access team name is not configured, trust the tunnel
  if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) {
    return {
      user: { email: 'tunnel-authenticated@pops.local' },
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
      };
    } catch (error) {
      console.error('[trpc] JWT verification failed:', error);
      return { user: null };
    }
  }

  return { user: null };
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
 * Protected procedure that requires valid Cloudflare Access JWT.
 * Use this for all authenticated endpoints.
 */
export const protectedProcedure = t.procedure.use(moduleGate).use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Cloudflare Access JWT',
    });
  }

  return next({
    ctx: {
      user: ctx.user,
    },
  });
});
