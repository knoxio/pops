/**
 * `features.*` sub-router — the feature-toggle surface restored on the core
 * pillar (epic 05 / S2). Mirrors the recovered monolith `features` tRPC router
 * (`apps/pops-api/src/modules/core/features`, `6b0cc148^`), now over REST.
 *
 * Six operations, semantics preserved EXACTLY:
 *   - `getManifests` (query)    → `GET    /features/manifests`
 *   - `list`         (query)    → `GET    /features`
 *   - `isEnabled`    (query)    → `GET    /features/:key/enabled`
 *   - `setEnabled`   (mutation) → `PUT    /features/:key/enabled`
 *   - `setUserPreference`   (mutation) → `PUT    /features/:key/preference`
 *   - `clearUserPreference` (mutation) → `DELETE /features/:key/preference`
 *
 * Identity model — every route is `protected` (the monolith used
 * `protectedProcedure` for all six). The four identity-dependent operations
 * (`list`, `isEnabled`, `setUserPreference`, `clearUserPreference`) resolve a
 * human principal and feed `ctx.user.email` to the service; the system-level
 * operations (`getManifests`, `setEnabled`) require any protected principal.
 * `401` therefore joins the common error set on every route. The service's
 * domain errors map as in the monolith: `FeatureNotFoundError` → 404,
 * `FeatureGateError` / `FeatureScopeError` → 400.
 *
 * Output schemas are reused from S1's leaf `features/types.ts`
 * (`FeatureManifestSchema` / `FeatureStatusSchema`, each `satisfies
 * z.ZodType<…>` against `@pops/types`), so the wire shape stays locked to the
 * outputs the service actually returns — and the import is a zod-only leaf, so
 * the contract does not pull the service/db layer.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { FeatureManifestSchema, FeatureStatusSchema } from '../api/modules/features/types.js';
import { AUTH_ERR_RESPONSES, NonEmptyString } from './rest-schemas.js';

const c = initContract();

const FeatureKeyParam = z.object({ key: NonEmptyString });
const EnabledBody = z.object({ enabled: z.boolean() });

export const coreFeaturesContract = c.router({
  getManifests: {
    method: 'GET',
    path: '/features/manifests',
    responses: {
      200: z.object({ manifests: z.array(FeatureManifestSchema) }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'List all registered feature manifests (sorted by order)',
  },
  list: {
    method: 'GET',
    path: '/features',
    responses: {
      200: z.object({ features: z.array(FeatureStatusSchema) }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Resolved feature status for the current user (admin Features page)',
  },
  isEnabled: {
    method: 'GET',
    path: '/features/:key/enabled',
    pathParams: FeatureKeyParam,
    responses: {
      200: z.object({ enabled: z.boolean() }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Runtime gate for a single feature in the current user context (404 on unknown key)',
  },
  setEnabled: {
    method: 'PUT',
    path: '/features/:key/enabled',
    pathParams: FeatureKeyParam,
    body: EnabledBody,
    responses: {
      200: z.object({ enabled: z.boolean() }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Set the system-level enabled state (400 when the gate is failing)',
  },
  setUserPreference: {
    method: 'PUT',
    path: '/features/:key/preference',
    pathParams: FeatureKeyParam,
    body: EnabledBody,
    responses: {
      200: z.object({ enabled: z.boolean() }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Set a per-user override (400 when the feature is not user-scoped)',
  },
  clearUserPreference: {
    method: 'DELETE',
    path: '/features/:key/preference',
    pathParams: FeatureKeyParam,
    body: z.object({}).optional(),
    responses: {
      200: z.object({ cleared: z.boolean() }),
      ...AUTH_ERR_RESPONSES,
    },
    summary: 'Remove a per-user override (resolution falls back to the system default)',
  },
});
