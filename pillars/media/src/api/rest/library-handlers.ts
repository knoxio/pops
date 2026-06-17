/**
 * Handlers for the `library.*` sub-router — the combined movies + TV-shows
 * grid reads plus the add/refresh ingestion mutations.
 *
 * Reads are thin wrappers over `libraryService` (rows → wire shapes). The
 * mutations delegate to the api-layer use-case services (`library-mutations`,
 * `tv-ingest`, `tv-refresh`) which orchestrate the TMDB / TheTVDB clients and
 * the pillar db services. Clients are resolved here via their env-configured
 * factories. Db-domain + upstream errors are mapped to `NotFoundError` /
 * `ConflictError` at this boundary.
 *
 * NOTE: the monolith's addMovie fired a best-effort Plex Discover watch-status
 * check after creating a movie. The plex domain is not ported yet (later
 * slice), so that side-effect is intentionally absent.
 */
import {
  type MediaDb,
  MovieConflictError,
  MovieNotFoundError,
  TvShowConflictError,
  TvShowNotFoundError,
  libraryService,
} from '../../db/index.js';
import { getTvdbClient } from '../clients/thetvdb/index.js';
import { getImageCache, getTmdbClient } from '../clients/tmdb/index.js';
import { TmdbApiError } from '../clients/tmdb/types.js';
import { addMovie, refreshMovie } from '../modules/library-mutations.js';
import { toLibraryItem } from '../modules/library-types.js';
import { toMovie } from '../modules/movie-types.js';
import { addTvShow } from '../modules/tv-ingest.js';
import { refreshTvShow } from '../modules/tv-refresh.js';
import { toSeason, toTvShow } from '../modules/tv-show-types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaLibraryContract } from '../../contract/rest-library.js';

type Req = ServerInferRequest<typeof mediaLibraryContract>;

/** Map a TMDB 404 to NotFound; surface every other TMDB failure verbatim. */
function mapTmdbNotFound(err: unknown, tmdbId: number): never {
  if (err instanceof TmdbApiError && err.status === 404) {
    throw new NotFoundError('Movie on TMDB', String(tmdbId));
  }
  throw err instanceof Error ? err : new Error(String(err));
}

export function makeLibraryHandlers(db: MediaDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const { rows, total } = libraryService.listLibrary(db, query);
        const totalPages = Math.ceil(total / query.pageSize);
        return {
          status: 200 as const,
          body: {
            data: rows.map(toLibraryItem),
            pagination: {
              page: query.page,
              pageSize: query.pageSize,
              total,
              totalPages,
              hasMore: query.page < totalPages,
            },
          },
        };
      }),

    genres: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: libraryService.listLibraryGenres(db) },
      })),

    quickPick: ({ query }: Req['quickPick']) =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: libraryService.getQuickPicks(db, query.count).map(toMovie) },
      })),

    addMovie: ({ body }: Req['addMovie']) =>
      runHttp(async () => {
        try {
          const { movie, created } = await addMovie(
            { db, tmdbClient: getTmdbClient(), imageCache: getImageCache() },
            body.tmdbId
          );
          return {
            status: 200 as const,
            body: {
              data: toMovie(movie),
              created,
              message: created ? 'Movie added to library' : 'Movie already in library',
            },
          };
        } catch (err) {
          if (err instanceof MovieConflictError) throw new ConflictError(err.message);
          mapTmdbNotFound(err, body.tmdbId);
        }
      }),

    refreshMovie: ({ params, body }: Req['refreshMovie']) =>
      runHttp(async () => {
        try {
          const row = await refreshMovie(
            { db, tmdbClient: getTmdbClient(), imageCache: getImageCache() },
            params.id,
            body.redownloadImages
          );
          return {
            status: 200 as const,
            body: { data: toMovie(row), message: 'Movie metadata refreshed' },
          };
        } catch (err) {
          if (err instanceof MovieNotFoundError)
            throw new NotFoundError('Movie', String(params.id));
          throw err;
        }
      }),

    addTvShow: ({ body }: Req['addTvShow']) =>
      runHttp(async () => {
        try {
          const result = await addTvShow(db, body.tvdbId, getTvdbClient(), getImageCache());
          return {
            status: 200 as const,
            body: {
              data: { show: toTvShow(result.show), seasons: result.seasons.map(toSeason) },
              created: result.created,
              message: result.created ? 'TV show added to library' : 'TV show already in library',
            },
          };
        } catch (err) {
          if (err instanceof TvShowConflictError) throw new ConflictError(err.message);
          throw err;
        }
      }),

    refreshTvShow: ({ params, body }: Req['refreshTvShow']) =>
      runHttp(async () => {
        try {
          const result = await refreshTvShow(db, getTvdbClient(), getImageCache(), {
            id: params.id,
            redownloadImages: body.redownloadImages,
            refreshEpisodes: body.refreshEpisodes,
          });
          return {
            status: 200 as const,
            body: {
              data: { show: toTvShow(result.show), seasons: result.seasons.map(toSeason) },
              episodesAdded: result.episodesAdded,
              episodesUpdated: result.episodesUpdated,
              seasonsAdded: result.seasonsAdded,
              seasonsUpdated: result.seasonsUpdated,
              message: 'TV show metadata refreshed',
            },
          };
        } catch (err) {
          if (err instanceof TvShowNotFoundError)
            throw new NotFoundError('TV show', String(params.id));
          throw err;
        }
      }),
  };
}
