/**
 * ts-rest handlers for `cerebrum.reflex.*` (pillars/cerebrum/docs/prds/reflex-system).
 *
 * Thin adapter over {@link ReflexService}: reads the in-memory registry
 * (loaded from `reflexes.toml`) and the append-only execution log in the
 * cerebrum DB. `get`/`test`/`enable`/`disable` 404 on an unknown reflex name.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumReflexContract } from '../../contract/rest-reflex.js';
import { NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ReflexService } from '../modules/reflex/reflex-service.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeReflexHandlers(
  service: ReflexService
): ReturnType<typeof server.router<typeof cerebrumReflexContract>> {
  return server.router(cerebrumReflexContract, {
    list: async ({ query }) => ({
      status: 200,
      body: { reflexes: service.listWithStatus(query.timezone) },
    }),

    get: async ({ params }) =>
      runHttp(() => {
        const result = service.getWithHistory(params.name);
        if (!result) throw new NotFoundError('reflex', params.name);
        return { status: 200, body: result };
      }),

    test: async ({ params }) =>
      runHttp(() => {
        if (!service.getByName(params.name)) throw new NotFoundError('reflex', params.name);
        return { status: 200, body: { result: service.testReflex(params.name) } };
      }),

    enable: async ({ params }) =>
      runHttp(() => {
        if (!service.getByName(params.name)) throw new NotFoundError('reflex', params.name);
        return { status: 200, body: { success: service.enableReflex(params.name) } };
      }),

    disable: async ({ params }) =>
      runHttp(() => {
        if (!service.getByName(params.name)) throw new NotFoundError('reflex', params.name);
        return { status: 200, body: { success: service.disableReflex(params.name) } };
      }),

    history: async ({ body }) => ({
      status: 200,
      body: service.getHistory(body),
    }),
  });
}
