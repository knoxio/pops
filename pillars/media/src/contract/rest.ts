/**
 * REST contract for the media pillar — ts-rest single source of truth.
 *
 * Composes the migrated domain sub-routers into the public wire surface.
 * `generateOpenApi(mediaContract, …)` projects this to
 * `openapi/media.openapi.json`; `openapi-typescript` then projects the JSON
 * to `src/contract/api-types.generated.ts`.
 *
 * Lego principle: this is the ONLY description of the media wire format.
 * Don't hand-author OpenAPI or hand-author paths anywhere else.
 */
import { initContract } from '@ts-rest/core';

import { mediaArrContract } from './rest-arr.js';
import { mediaComparisonsContract } from './rest-comparisons.js';
import { mediaDiscoveryContract } from './rest-discovery.js';
import { mediaLibraryContract } from './rest-library.js';
import { mediaMoviesContract } from './rest-movies.js';
import { mediaPlexContract } from './rest-plex.js';
import { mediaRotationContract } from './rest-rotation.js';
import { mediaSearchContract } from './rest-search.js';
import { mediaShelfImpressionsContract } from './rest-shelf-impressions.js';
import { mediaTvShowsContract } from './rest-tv-shows.js';
import { mediaWatchHistoryContract } from './rest-watch-history.js';
import { mediaWatchlistContract } from './rest-watchlist.js';

const c = initContract();

export const mediaContract = c.router(
  {
    movies: mediaMoviesContract,
    tvShows: mediaTvShowsContract,
    library: mediaLibraryContract,
    watchlist: mediaWatchlistContract,
    watchHistory: mediaWatchHistoryContract,
    shelfImpressions: mediaShelfImpressionsContract,
    arr: mediaArrContract,
    plex: mediaPlexContract,
    comparisons: mediaComparisonsContract,
    rotation: mediaRotationContract,
    discovery: mediaDiscoveryContract,
    search: mediaSearchContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type MediaRestContract = typeof mediaContract;
