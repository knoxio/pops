/**
 * Handlers for the ai pillar's `settings.*` sub-router, delegating to the shared
 * `@pops/pillar-settings` Read/Update/Reset service.
 *
 * The shared `makeSettingsHandlers` owns the RU+reset logic, the declared-key
 * assertion, and the read-side sensitive redaction. The ai pillar injects its
 * own `settings`-table store (in `ai.db`), the `ai.settings` scope prefix, and a
 * no-op gate — the ai-api is internal to the docker network and carries no
 * per-user identity surface in v1 (the dashboard reaches it through nginx).
 */
import { makeSettingsHandlers as makeSharedSettingsHandlers } from '@pops/pillar-settings';

import { aiKeyDefaults } from '../../contract/settings/key-defaults.js';
import { type AiDb } from '../../db/index.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { SettingsGate } from '@pops/pillar-settings';

import type { aiSettingsContract } from '../../contract/rest-settings.js';

type Req = ServerInferRequest<typeof aiSettingsContract>;

const SCOPE_PREFIX = 'ai.settings';

type AiPrincipal = undefined;

const gate: SettingsGate<AiPrincipal> = () => {
  /* no-op: ai-api is internal (docker-network only), no per-user gating in v1 */
};

export function makeAiSettingsHandlers(db: AiDb) {
  const shared = makeSharedSettingsHandlers<AiPrincipal>({
    db,
    scopePrefix: SCOPE_PREFIX,
    keyDefaults: aiKeyDefaults,
    gate,
  });

  return {
    list: () => runHttp(() => ({ status: 200 as const, body: shared.list(undefined) })),

    get: ({ params }: Req['get']) =>
      runHttp(() => ({ status: 200 as const, body: shared.get(undefined, params.key) })),

    getMany: ({ body }: Req['getMany']) =>
      runHttp(() => ({ status: 200 as const, body: shared.getMany(undefined, body.keys) })),

    set: ({ params, body }: Req['set']) =>
      runHttp(() => ({
        status: 200 as const,
        body: shared.set(undefined, params.key, body.value),
      })),

    setMany: ({ body }: Req['setMany']) =>
      runHttp(() => ({ status: 200 as const, body: shared.setMany(undefined, body.entries) })),

    resetKey: ({ params }: Req['resetKey']) =>
      runHttp(() => ({ status: 200 as const, body: shared.resetKey(undefined, params.key) })),

    reset: ({ body }: Req['reset']) =>
      runHttp(() => {
        const result = shared.reset(undefined, body.keys);
        return {
          status: 200 as const,
          body: { reset: [...result.reset], settings: { ...result.settings } },
        };
      }),

    ensure: ({ params, body }: Req['ensure']) =>
      runHttp(() => ({
        status: 200 as const,
        body: shared.ensure(undefined, params.key, body.value),
      })),
  };
}
