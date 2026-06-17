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
import { makeArrHandlers } from './arr-handlers.js';
import { makeLibraryHandlers } from './library-handlers.js';
import { makeMoviesHandlers } from './movies-handlers.js';
import { makePlexHandlers } from './plex-handlers.js';
import { makeShelfImpressionsHandlers } from './shelf-impressions-handlers.js';
import { makeTvShowsHandlers } from './tv-shows-handlers.js';
import { makeWatchHistoryHandlers } from './watch-history-handlers.js';
import { makeWatchlistHandlers } from './watchlist-handlers.js';

const server: ReturnType<typeof initServer> = initServer();

export function makeMediaRestHandlers(deps: {
  mediaDb: OpenedMediaDb;
}): ReturnType<typeof server.router<typeof mediaContract>> {
  const db = deps.mediaDb.db;
  return server.router(mediaContract, {
    movies: makeMoviesHandlers(db),
    tvShows: makeTvShowsHandlers(db),
    library: makeLibraryHandlers(db),
    watchlist: makeWatchlistHandlers(db),
    watchHistory: makeWatchHistoryHandlers(db),
    shelfImpressions: makeShelfImpressionsHandlers(db),
    arr: makeArrHandlers(db),
    plex: makePlexHandlers(db),
  });
}
