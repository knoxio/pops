/**
 * Handlers for the `plex.*` sub-router (connection + auth).
 *
 * Thin wrappers over the Plex connection client + the plex.tv auth flow in
 * `../clients/plex`. Token persistence is backed by the pillar-owned
 * `plex_settings` table. `requirePlexClient` raises `ConflictError` (409)
 * when the server is not yet configured, before any upstream call.
 */
import { type MediaDb } from '../../db/index.js';
import {
  PlexApiError,
  type PlexClient,
  checkAuthPin,
  disconnect,
  getPlexClient,
  getPlexSectionIds,
  getPlexUrl,
  getPlexUsername,
  getSyncStatus,
  requestAuthPin,
  savePlexSectionIds,
  setPlexUrl,
  testConnection,
} from '../clients/plex/index.js';
import { ConflictError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';
import { makePlexSchedulerHandlers } from './plex-scheduler-handlers.js';
import { makePlexSyncHandlers } from './plex-sync-handlers.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaPlexContract } from '../../contract/rest-plex.js';

type Req = ServerInferRequest<typeof mediaPlexContract>;

function requirePlexClient(db: MediaDb): PlexClient {
  const client = getPlexClient(db);
  if (client === null) throw new ConflictError('Plex is not configured');
  return client;
}

export function makePlexHandlers(db: MediaDb) {
  return {
    ...makePlexSyncHandlers(db),
    ...makePlexSchedulerHandlers(db),
    testConnection: () =>
      runHttp(async () => {
        const client = requirePlexClient(db);
        try {
          return {
            status: 200 as const,
            body: { data: { connected: await testConnection(client) } },
          };
        } catch (err) {
          if (err instanceof PlexApiError) {
            return {
              status: 200 as const,
              body: { data: { connected: false, error: err.message } },
            };
          }
          throw err;
        }
      }),

    getLibraries: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await requirePlexClient(db).getLibraries() },
      })),

    getPlexUrl: () => runHttp(() => ({ status: 200 as const, body: { data: getPlexUrl(db) } })),

    setUrl: ({ body }: Req['setUrl']) =>
      runHttp(async () => {
        await setPlexUrl(db, body.url);
        return { status: 200 as const, body: { message: 'Plex URL updated and validated' } };
      }),

    getPlexUsername: () =>
      runHttp(() => ({ status: 200 as const, body: { data: getPlexUsername(db) } })),

    getAuthPin: () =>
      runHttp(async () => ({ status: 200 as const, body: { data: await requestAuthPin(db) } })),

    checkAuthPin: ({ body }: Req['checkAuthPin']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: { data: await checkAuthPin(db, body.id) },
      })),

    disconnect: () =>
      runHttp(() => {
        disconnect(db);
        return { status: 200 as const, body: { message: 'Disconnected from Plex' } };
      }),

    getSyncStatus: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: getSyncStatus(db, getPlexClient(db)) },
      })),

    getSectionIds: () =>
      runHttp(() => ({ status: 200 as const, body: { data: getPlexSectionIds(db) } })),

    saveSectionIds: ({ body }: Req['saveSectionIds']) =>
      runHttp(() => {
        savePlexSectionIds(db, body.movieSectionId, body.tvSectionId);
        return { status: 200 as const, body: { message: 'Section IDs saved' } };
      }),
  };
}
