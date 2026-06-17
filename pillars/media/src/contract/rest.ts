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

import { mediaMoviesContract } from './rest-movies.js';
import { mediaShelfImpressionsContract } from './rest-shelf-impressions.js';
import { mediaWatchlistContract } from './rest-watchlist.js';

const c = initContract();

export const mediaContract = c.router(
  {
    movies: mediaMoviesContract,
    watchlist: mediaWatchlistContract,
    shelfImpressions: mediaShelfImpressionsContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type MediaRestContract = typeof mediaContract;
