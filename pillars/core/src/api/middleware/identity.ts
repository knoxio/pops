/**
 * Express identity middleware for the core pillar's ts-rest surface.
 *
 * Reproduces, verbatim, the principal-resolution logic that
 * `createCoreTrpcContextFactory` in `../trpc.ts` runs per request:
 *
 *   1. `x-api-key` → `serviceAccountsService.authenticateServiceAccount`.
 *   2. non-production → dev fallback user (`dev@example.com`).
 *   3. no `CLOUDFLARE_ACCESS_TEAM_NAME` → tunnel user
 *      (`tunnel-authenticated@pops.local`).
 *   4. `cf-access-jwt-assertion` → `verifyCloudflareJWT` → `{ email }`.
 *   5. otherwise → anonymous (`{ user: null, serviceAccount: null }`).
 *
 * The middleware RESOLVES identity — it never rejects globally. Per-route
 * gating lives in the handlers via {@link requireUser} / {@link requireProtected},
 * matching the tRPC split where `publicProcedure` needs no principal at all.
 *
 * The resolved principal is attached to `res.locals.principal`, which the
 * ts-rest/express handlers read through the `res` they are handed (see
 * `@ts-rest/express`'s `AppRouteImplementation`, which passes `{ req, res }`).
 */
import {
  type AuthenticatedServiceAccount,
  type CoreDb,
  serviceAccountKeys,
  serviceAccountsService,
} from '../../db/index.js';
import { UnauthorizedError } from '../shared/errors.js';
import { verifyCloudflareJWT } from './cloudflare-jwt.js';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { User } from '../trpc.js';

/**
 * The principal resolved per request. Mirrors the auth-relevant slice of the
 * tRPC `Context` (`user` + `serviceAccount`); the DB handle is injected into
 * handlers separately, so it is not carried here.
 */
export interface Principal {
  user: User | null;
  serviceAccount: AuthenticatedServiceAccount | null;
}

/**
 * Principal stashed on `res.locals` by {@link createIdentityMiddleware}.
 * Handlers read it via {@link readPrincipal}.
 */
export interface IdentityLocals {
  principal?: Principal;
}

function readApiKeyHeader(req: Request): string | null {
  const raw = req.headers['x-api-key'];
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return null;
}

async function tryServiceAccountAuth(
  coreDb: CoreDb,
  req: Request
): Promise<AuthenticatedServiceAccount | null> {
  const header = readApiKeyHeader(req);
  if (!header) return null;
  const parsed = serviceAccountKeys.parseApiKey(header);
  if (!parsed) return null;
  return serviceAccountsService.authenticateServiceAccount(coreDb, parsed.prefix, parsed.secret);
}

/**
 * Resolve the request principal exactly as `createCoreTrpcContextFactory`
 * does. Pure of Express response concerns so it can be unit-tested directly.
 */
export async function resolvePrincipal(coreDb: CoreDb, req: Request): Promise<Principal> {
  const serviceAccount = await tryServiceAccountAuth(coreDb, req);
  if (serviceAccount) {
    return { user: null, serviceAccount };
  }

  if (process.env['NODE_ENV'] !== 'production') {
    return { user: { email: 'dev@example.com' }, serviceAccount: null };
  }

  if (!process.env['CLOUDFLARE_ACCESS_TEAM_NAME']) {
    return { user: { email: 'tunnel-authenticated@pops.local' }, serviceAccount: null };
  }

  const token = req.headers['cf-access-jwt-assertion'];
  if (typeof token === 'string') {
    try {
      const payload = await verifyCloudflareJWT(token);
      return { user: { email: payload.email }, serviceAccount: null };
    } catch (error) {
      console.error('[core-api] JWT verification failed:', error);
      return { user: null, serviceAccount: null };
    }
  }

  return { user: null, serviceAccount: null };
}

/**
 * Build the per-request identity middleware bound to a core DB handle. Mount
 * it BEFORE `createExpressEndpoints` so every REST handler sees the resolved
 * principal on `res.locals.principal`. Resolution failures inside the auth
 * pipeline (e.g. a thrown DB error) propagate to `next` so Express surfaces a
 * real 500 rather than a silent anonymous request.
 */
export function createIdentityMiddleware(coreDb: CoreDb): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    void resolvePrincipal(coreDb, req)
      .then((principal) => {
        (res.locals as IdentityLocals).principal = principal;
        next();
      })
      .catch(next);
  };
}

/**
 * Read the principal a prior {@link createIdentityMiddleware} attached. If
 * the middleware did not run (mis-wiring) the principal is absent — treated
 * as fully anonymous so a missing mount fails closed at the gate rather than
 * silently authorising.
 */
export function readPrincipal(res: Response): Principal {
  const fromLocals = (res.locals as IdentityLocals).principal;
  return fromLocals ?? { user: null, serviceAccount: null };
}

/**
 * `userOnly` gate — requires a human (Cloudflare Access) session. Service-
 * account principals are rejected unconditionally. Mirrors
 * `userOnlyProcedure` in `trpc.ts`. Throws {@link UnauthorizedError} (401)
 * which `runHttp` maps to the wire envelope.
 */
export function requireUser(principal: Principal): User {
  if (!principal.user) {
    throw new UnauthorizedError('This endpoint requires a Cloudflare Access user session.');
  }
  return principal.user;
}

/**
 * `protected` gate — a human session OR a service account whose granted
 * scopes cover `path`. Mirrors `protectedProcedure` in `trpc.ts`: a user
 * passes unconditionally; a service account passes only with the matching
 * scope; an anonymous caller is rejected. The tRPC layer distinguishes the
 * scope miss (FORBIDDEN) from the anonymous case (UNAUTHORIZED), but both
 * collapse to a single 401 on the REST surface — the caller cannot reach the
 * resource either way. Throws {@link UnauthorizedError} (401).
 */
export function requireProtected(principal: Principal, path: string): Principal {
  if (principal.user) return principal;

  if (principal.serviceAccount) {
    if (!serviceAccountsService.hasScopeFor(principal.serviceAccount.scopes, path)) {
      throw new UnauthorizedError(
        `Service account '${principal.serviceAccount.name}' is not authorised for '${path}'`
      );
    }
    return principal;
  }

  throw new UnauthorizedError(
    'Missing or invalid credentials (expected Cloudflare Access JWT or X-API-Key)'
  );
}
