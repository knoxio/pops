/**
 * Handlers for core's `settings.*` sub-router, delegating to the shared
 * `@pops/pillar-settings` Read/Update/Reset service (settings-federation S1).
 *
 * The shared `makeSettingsHandlers` owns the RU+reset logic, the declared-key
 * assertion, and the read-side sensitive redaction. Core injects three things:
 * its `CoreDb` settings store, the `core.settings` scope prefix, and its
 * identity gate (`requireProtected`) so a service account needs the identical
 * `core.settings.<proc>` scope grant it did before. The gate runs INSIDE
 * `runHttp`, so the `UnauthorizedError` it throws maps to a 401 envelope.
 *
 * Read paths (`list`/`get`/`getMany`) redact any key flagged `sensitive` in
 * core's manifests to the `REDACTED` sentinel; write/reset paths persist and
 * return the real value. Core declares no sensitive keys today, so current
 * reads are unchanged — the redaction is wired for forward keys.
 *
 * The legacy `DELETE /settings/:key` is a rolling-deploy alias mapping to
 * reset-to-default via the shared `resetKey` handler; it preserves the old
 * `{ message }` response so an un-upgraded shell keeps working.
 */
import { makeSettingsHandlers as makeSharedSettingsHandlers } from '@pops/pillar-settings';

import { coreKeyDefaults } from '../../contract/settings/key-defaults.js';
import { type CoreDb } from '../../db/index.js';
import { type Principal, readPrincipal, requireProtected } from '../middleware/identity.js';
import { runHttp } from './error-mapping.js';
import { makeSettingsAggregateHandler } from './settings-aggregate-handler.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { SettingsGate } from '@pops/pillar-settings';

import type { coreSettingsContract } from '../../contract/rest-settings.js';

type Req = ServerInferRequest<typeof coreSettingsContract>;

const SCOPE_PREFIX = 'core.settings';

const gate: SettingsGate<Principal> = (principal, scope) => {
  requireProtected(principal, scope);
};

export function makeSettingsHandlers(db: CoreDb) {
  const shared = makeSharedSettingsHandlers<Principal>({
    db,
    scopePrefix: SCOPE_PREFIX,
    keyDefaults: coreKeyDefaults,
    gate,
  });

  return {
    aggregate: makeSettingsAggregateHandler(db),

    list: ({ res }: { res: Response }) =>
      runHttp(() => ({ status: 200 as const, body: shared.list(readPrincipal(res)) })),

    get: ({ params, res }: Req['get'] & { res: Response }) =>
      runHttp(() => ({ status: 200 as const, body: shared.get(readPrincipal(res), params.key) })),

    getMany: ({ body, res }: Req['getMany'] & { res: Response }) =>
      runHttp(() => ({
        status: 200 as const,
        body: shared.getMany(readPrincipal(res), body.keys),
      })),

    set: ({ params, body, res }: Req['set'] & { res: Response }) =>
      runHttp(() => ({
        status: 200 as const,
        body: shared.set(readPrincipal(res), params.key, body.value),
      })),

    setMany: ({ body, res }: Req['setMany'] & { res: Response }) =>
      runHttp(() => ({
        status: 200 as const,
        body: shared.setMany(readPrincipal(res), body.entries),
      })),

    resetKey: ({ params, res }: Req['resetKey'] & { res: Response }) =>
      runHttp(() => ({
        status: 200 as const,
        body: shared.resetKey(readPrincipal(res), params.key),
      })),

    reset: ({ body, res }: Req['reset'] & { res: Response }) =>
      runHttp(() => {
        const result = shared.reset(readPrincipal(res), body.keys);
        return {
          status: 200 as const,
          body: { reset: [...result.reset], settings: { ...result.settings } },
        };
      }),

    ensure: ({ params, body, res }: Req['ensure'] & { res: Response }) =>
      runHttp(() => ({
        status: 200 as const,
        body: shared.ensure(readPrincipal(res), params.key, body.value),
      })),

    delete: ({ params, res }: Req['delete'] & { res: Response }) =>
      runHttp(() => {
        shared.resetKey(readPrincipal(res), params.key);
        return { status: 200 as const, body: { message: 'Setting reset to default' } };
      }),
  };
}
