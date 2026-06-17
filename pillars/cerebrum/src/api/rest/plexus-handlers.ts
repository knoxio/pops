/**
 * ts-rest handlers for `cerebrum.plexus.*`.
 *
 * Reads (`adapters.list` / `adapters.get` / `filters.list`) and the
 * `filters.set` write resolve straight through the in-pillar `plexusService`
 * over the supplied `CerebrumDb` handle. The lifecycle mutations
 * (`healthCheck` / `sync` / `unregister`) delegate to the per-handle
 * `PlexusLifecycleManager` singleton.
 *
 * Error mapping mirrors the monolith router: a missing adapter on `get`
 * surfaces as 404; `filters.set` validates every pattern as a regex up front
 * (400 on a bad one) and translates the service's `PlexusAdapterNotFoundError`
 * into the pillar `NotFoundError` (404) so a phantom-adapter write never
 * orphans filter rules.
 */
import { initServer } from '@ts-rest/express';

import { cerebrumPlexusContract } from '../../contract/rest-plexus.js';
import { plexusService, PlexusAdapterNotFoundError, type CerebrumDb } from '../../db/index.js';
import { getPlexusLifecycle } from '../modules/plexus/instance.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

const server: ReturnType<typeof initServer> = initServer();

function assertValidPatterns(filters: ReadonlyArray<{ field: string; pattern: string }>): void {
  for (const f of filters) {
    try {
      new RegExp(f.pattern);
    } catch {
      throw new ValidationError(`Invalid regex pattern '${f.pattern}' for field '${f.field}'`);
    }
  }
}

export function makePlexusHandlers(
  db: CerebrumDb
): ReturnType<typeof server.router<typeof cerebrumPlexusContract>> {
  return server.router(cerebrumPlexusContract, {
    adapters: {
      list: async () => ({ status: 200, body: { adapters: plexusService.listAdapters(db) } }),
      get: async ({ params }) =>
        runHttp(() => {
          const adapter = plexusService.getAdapter(db, params.adapterId);
          if (!adapter) throw new NotFoundError('adapter', params.adapterId);
          return { status: 200, body: { adapter } };
        }),
      healthCheck: async ({ params }) => {
        const result = await getPlexusLifecycle(db).healthCheck(params.adapterId);
        return { status: 200, body: result };
      },
      sync: async ({ params }) => {
        const result = await getPlexusLifecycle(db).sync(params.adapterId);
        return { status: 200, body: result };
      },
      unregister: async ({ params }) => {
        const success = await getPlexusLifecycle(db).unregister(params.adapterId);
        return { status: 200, body: { success } };
      },
    },
    filters: {
      list: async ({ params }) => ({
        status: 200,
        body: { filters: plexusService.listFilters(db, params.adapterId) },
      }),
      set: async ({ params, body }) =>
        runHttp(() => {
          assertValidPatterns(body.filters);
          try {
            const filters = plexusService.setFilters(db, params.adapterId, body.filters);
            return { status: 200, body: { filters } };
          } catch (err) {
            if (err instanceof PlexusAdapterNotFoundError) {
              throw new NotFoundError('adapter', params.adapterId);
            }
            throw err;
          }
        }),
    },
  });
}
