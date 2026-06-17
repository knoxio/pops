/**
 * ts-rest handler composer for the media pillar.
 *
 * Stitches the per-domain handler factories into the typed
 * `RouterImplementation<MediaRestContract>` that `createExpressEndpoints`
 * consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { mediaContract } from '../../contract/rest.js';
import { type OpenedMediaDb } from '../../db/index.js';
import { makeMoviesHandlers } from './movies-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeMediaRestHandlers(deps: {
  mediaDb: OpenedMediaDb;
}): ReturnType<typeof server.router<typeof mediaContract>> {
  const db = deps.mediaDb.db;
  return server.router(mediaContract, {
    movies: makeMoviesHandlers(db),
  });
}
