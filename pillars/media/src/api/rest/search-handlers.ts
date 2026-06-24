/**
 * Handlers for the `search.*` sub-router — live provider search.
 *
 * Thin pass-throughs to the env-configured TMDB / TheTVDB clients (no db).
 * Provider failures (`TmdbApiError` / `TvdbApiError`) are translated to
 * `BadGatewayError` (502) at this boundary; everything else propagates to
 * Express.
 */
import { getTvdbClient } from '../clients/thetvdb/index.js';
import { TvdbApiError } from '../clients/thetvdb/types.js';
import { getTmdbClient } from '../clients/tmdb/index.js';
import { TmdbApiError } from '../clients/tmdb/types.js';
import { BadGatewayError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaSearchContract } from '../../contract/rest-search.js';

type Req = ServerInferRequest<typeof mediaSearchContract>;

export function makeSearchHandlers() {
  return {
    movies: ({ query }: Req['movies']) =>
      runHttp(async () => {
        try {
          const response = await getTmdbClient().searchMovies(query.query, query.page);
          return {
            status: 200 as const,
            body: {
              results: response.results,
              totalResults: response.totalResults,
              totalPages: response.totalPages,
              page: response.page,
            },
          };
        } catch (err) {
          if (err instanceof TmdbApiError)
            throw new BadGatewayError(`TMDB API error: ${err.message}`);
          throw err;
        }
      }),

    tvShows: ({ query }: Req['tvShows']) =>
      runHttp(async () => {
        try {
          const results = await getTvdbClient().searchSeries(query.query);
          return { status: 200 as const, body: { results } };
        } catch (err) {
          if (err instanceof TvdbApiError)
            throw new BadGatewayError(`TheTVDB API error: ${err.message}`);
          throw err;
        }
      }),
  };
}
