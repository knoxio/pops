/**
 * Handlers for the rotation source CRUD/sync + settings routes.
 *
 * Source CRUD wraps the `@pops/media` rotation sources service (the wire shape
 * parses `config` JSON + projects `enabled` to a boolean via the source-wire
 * mappers). `syncSource` + `listPlexFriends` are api-layer orchestration
 * (TMDB/Plex clients). Settings read/write the pillar-owned `rotation_settings`
 * kv table. Domain errors are translated via `guardRotation` + `runHttp`.
 */
import { type MediaDb, rotationSourcesService } from '../../db/index.js';
import { fetchPlexFriends, getPlexToken } from '../clients/plex/index.js';
import { registerRotationSources } from '../modules/rotation-register-sources.js';
import { getRotationSettings, saveRotationSettings } from '../modules/rotation-settings-config.js';
import { getRegisteredTypes } from '../modules/rotation-source-registry.js';
import { syncSource } from '../modules/rotation-source-sync.js';
import { toSourceWire, toSourceWithCountWire } from '../modules/rotation-source-wire.js';
import { runHttp } from './error-mapping.js';
import { guardRotation } from './rotation-handlers-shared.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaRotationContract } from '../../contract/rest-rotation.js';

type Req = ServerInferRequest<typeof mediaRotationContract>;

const DEFAULT_PRIORITY = 5;
const DEFAULT_SYNC_INTERVAL_HOURS = 24;

async function listPlexFriends(db: MediaDb) {
  const token = getPlexToken(db);
  if (token === null) {
    return { friends: [], error: 'Plex token not configured' };
  }
  try {
    return { friends: await fetchPlexFriends(token), error: null };
  } catch (err) {
    return {
      friends: [],
      error: err instanceof Error ? err.message : 'Failed to fetch Plex friends',
    };
  }
}

export function makeRotationSourceHandlers(db: MediaDb) {
  return {
    sourceTypes: () =>
      runHttp(() => {
        registerRotationSources();
        return { status: 200 as const, body: { data: { types: getRegisteredTypes() } } };
      }),

    listPlexFriends: () =>
      runHttp(async () => ({ status: 200 as const, body: { data: await listPlexFriends(db) } })),

    listSources: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: rotationSourcesService.listSources(db).map(toSourceWithCountWire) },
      })),

    createSource: ({ body }: Req['createSource']) =>
      runHttp(() => {
        const created = rotationSourcesService.createSource(db, {
          type: body.type,
          name: body.name,
          priority: body.priority ?? DEFAULT_PRIORITY,
          enabled: body.enabled ?? true,
          config: JSON.stringify(body.config ?? {}),
          syncIntervalHours: body.syncIntervalHours ?? DEFAULT_SYNC_INTERVAL_HOURS,
        });
        return { status: 201 as const, body: { data: toSourceWire(created) } };
      }),

    updateSource: ({ params, body }: Req['updateSource']) =>
      runHttp(() =>
        guardRotation(() => {
          const updated = rotationSourcesService.updateSource(db, params.id, {
            name: body.name,
            priority: body.priority,
            enabled: body.enabled,
            config: body.config === undefined ? undefined : JSON.stringify(body.config),
            syncIntervalHours: body.syncIntervalHours,
          });
          return { status: 200 as const, body: { data: toSourceWire(updated) } };
        })
      ),

    deleteSource: ({ params }: Req['deleteSource']) =>
      runHttp(() =>
        guardRotation(() => {
          rotationSourcesService.deleteSource(db, params.id);
          return { status: 200 as const, body: { data: { success: true } } };
        })
      ),

    syncSource: ({ params }: Req['syncSource']) =>
      runHttp(() =>
        guardRotation(async () => ({
          status: 200 as const,
          body: { data: await syncSource(db, params.id) },
        }))
      ),

    getSettings: () =>
      runHttp(() => ({ status: 200 as const, body: { data: getRotationSettings(db) } })),

    saveSettings: ({ body }: Req['saveSettings']) =>
      runHttp(() => {
        const updated = saveRotationSettings(db, body);
        return { status: 200 as const, body: { data: { success: true, updated } } };
      }),
  };
}
