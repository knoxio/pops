/**
 * Handlers for the `features.*` sub-router (epic 05 / S2).
 *
 * Thin REST adapter over S1's feature-toggle service. Every route is
 * identity-gated — the monolith served all six through `protectedProcedure`:
 *
 *   - `getManifests`, `setEnabled` are system-level: any protected principal
 *     (a human session OR a service account scoped for `core.features.<op>`)
 *     passes via {@link requireProtected}, mirroring `settings.*`.
 *   - `list`, `isEnabled`, `setUserPreference`, `clearUserPreference` resolve a
 *     per-user value (`ctx.user.email`), so they require a HUMAN principal via
 *     {@link requireUser}. A service account carries no email; rejecting it at
 *     the gate (401) is the faithful pillar mirror of the monolith's
 *     `protectedProcedure` + unconditional `ctx.user.email` deref.
 *
 * Service domain errors map exactly as the monolith router did:
 *   - `FeatureNotFoundError`  → 404 (PRD-101: an undeclared key is a bug).
 *   - `FeatureGateError`      → 400 (enable blocked by failing gate).
 *   - `FeatureScopeError`     → 400 (write targets the wrong scope).
 *
 * The gates run INSIDE `runHttp`, so the `UnauthorizedError` they throw is
 * mapped to a 401 envelope. The translated `Validation`/`NotFound` errors ride
 * the same `HttpError` mapping.
 */
import { type CoreDb } from '../../db/index.js';
import { readPrincipal, requireProtected, requireUser, type User } from '../middleware/identity.js';
import {
  clearUserPreference,
  FeatureGateError,
  FeatureNotFoundError,
  FeatureScopeError,
  getFeatureManifests,
  isEnabled,
  listFeatures,
  setFeatureEnabled,
  setUserPreference,
} from '../modules/features/index.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { coreFeaturesContract } from '../../contract/rest-features.js';

type Req = ServerInferRequest<typeof coreFeaturesContract>;

const SCOPE_PREFIX = 'core.features';

/**
 * Translate the feature service's domain errors into the REST `HttpError`
 * mapping (`FeatureNotFoundError` → 404, `FeatureGateError` /
 * `FeatureScopeError` → 400). Anything else propagates untouched.
 */
function mapServiceError(err: unknown): never {
  if (err instanceof FeatureNotFoundError) {
    throw new NotFoundError('Feature', err.key);
  }
  if (err instanceof FeatureGateError || err instanceof FeatureScopeError) {
    throw new ValidationError({ reason: err.name, message: err.message });
  }
  throw err;
}

export function makeFeaturesHandlers(db: CoreDb) {
  const asUser = (res: Response): User => requireUser(readPrincipal(res));

  return {
    getManifests: ({ res }: Req['getManifests'] & { res: Response }) =>
      runHttp(() => {
        requireProtected(readPrincipal(res), `${SCOPE_PREFIX}.getManifests`);
        return { status: 200 as const, body: { manifests: [...getFeatureManifests(db)] } };
      }),

    list: ({ res }: Req['list'] & { res: Response }) =>
      runHttp(() => {
        const user = asUser(res);
        return {
          status: 200 as const,
          body: { features: listFeatures(db, { email: user.email }) },
        };
      }),

    isEnabled: ({ params, res }: Req['isEnabled'] & { res: Response }) =>
      runHttp(() => {
        const user = asUser(res);
        try {
          return {
            status: 200 as const,
            body: { enabled: isEnabled(db, params.key, { user: { email: user.email } }) },
          };
        } catch (err) {
          mapServiceError(err);
        }
      }),

    setEnabled: ({ params, body, res }: Req['setEnabled'] & { res: Response }) =>
      runHttp(() => {
        requireProtected(readPrincipal(res), `${SCOPE_PREFIX}.setEnabled`);
        try {
          return {
            status: 200 as const,
            body: { enabled: setFeatureEnabled(db, params.key, body.enabled) },
          };
        } catch (err) {
          mapServiceError(err);
        }
      }),

    setUserPreference: ({ params, body, res }: Req['setUserPreference'] & { res: Response }) =>
      runHttp(() => {
        const user = asUser(res);
        try {
          return {
            status: 200 as const,
            body: {
              enabled: setUserPreference(db, params.key, { email: user.email }, body.enabled),
            },
          };
        } catch (err) {
          mapServiceError(err);
        }
      }),

    clearUserPreference: ({ params, res }: Req['clearUserPreference'] & { res: Response }) =>
      runHttp(() => {
        const user = asUser(res);
        try {
          return {
            status: 200 as const,
            body: { cleared: clearUserPreference(db, params.key, { email: user.email }) },
          };
        } catch (err) {
          mapServiceError(err);
        }
      }),
  };
}
