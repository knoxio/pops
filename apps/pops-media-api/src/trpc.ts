/**
 * tRPC initialisation for the media pillar container.
 *
 * Mirrors the auth surface of `apps/pops-core-api/src/trpc.ts` (Track M1
 * PR 1) but trims off the service-account branch — the media container
 * has no `core.db` handle to validate `X-API-Key` against, and the
 * migrated `shelf_impressions` slice is system-internal anyway. The
 * dispatcher in front of pops-api (until Phase 5 PR 2) terminates
 * service-account principals before the call ever leaves the gateway, so
 * media-api only needs the human-user / dev-fallback paths.
 *
 * The media DB handle is injected at context-creation time via the
 * factory in `createMediaTrpcContextFactory` so tests can swap in an
 * in-memory handle without touching env vars or the production resolver.
 */
import { initTRPC, TRPCError } from '@trpc/server';

import { type MediaDb } from '@pops/media-db';

import { verifyCloudflareJWT } from './middleware/cloudflare-jwt.js';

import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export interface User {
  email: string;
}

export interface Context {
  user: User | null;
  mediaDb: MediaDb;
}

/**
 * Build a tRPC context factory bound to a specific media DB handle.
 *
 * Production wires this at boot from `openMediaDb(resolveMediaSqlitePath())`;
 * tests pass in an in-memory handle so each suite is hermetic.
 */
export function createMediaTrpcContextFactory(
  mediaDb: MediaDb
): (opts: CreateExpressContextOptions) => Promise<Context> {
  return async ({ req }: CreateExpressContextOptions): Promise<Context> => {
    if (process.env['NODE_ENV'] !== 'production') {
      return { user: { email: 'dev@example.com' }, mediaDb };
    }

    if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) {
      return { user: { email: 'tunnel-authenticated@pops.local' }, mediaDb };
    }

    const token = req.headers['cf-access-jwt-assertion'];
    if (typeof token === 'string') {
      try {
        const payload = await verifyCloudflareJWT(token);
        return { user: { email: payload.email }, mediaDb };
      } catch (error) {
        console.error('[media-api] JWT verification failed:', error);
        return { user: null, mediaDb };
      }
    }

    return { user: null, mediaDb };
  };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid credentials (expected Cloudflare Access JWT)',
    });
  }
  return next({
    ctx: {
      user: ctx.user,
      mediaDb: ctx.mediaDb,
    },
  });
});
