/**
 * Handlers for the `movies.*` sub-router.
 *
 * Thin wrappers over `@pops/media` `moviesService`: parse → service call →
 * `toMovie` → typed envelope. Db domain errors (`MovieNotFoundError`,
 * `MovieConflictError`) are translated to the shared `HttpError` subclasses
 * the REST error mapping understands (404 / 409).
 */
import {
  type MediaDb,
  MovieConflictError,
  MovieNotFoundError,
  moviesService,
} from '../../db/index.js';
import { toMovie } from '../modules/movie-types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaMoviesContract } from '../../contract/rest-movies.js';

type Req = ServerInferRequest<typeof mediaMoviesContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export function makeMoviesHandlers(db: MediaDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = moviesService.listMovies(
          db,
          { search: query.search, genre: query.genre },
          limit,
          offset
        );
        return {
          status: 200 as const,
          body: { data: rows.map(toMovie), pagination: paginationMeta(total, limit, offset) },
        };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = moviesService.getMovie(db, params.id);
          return { status: 200 as const, body: { data: toMovie(row) } };
        } catch (err) {
          if (err instanceof MovieNotFoundError)
            throw new NotFoundError('Movie', String(params.id));
          throw err;
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = moviesService.createMovie(db, body);
          return { status: 201 as const, body: { data: toMovie(row), message: 'Movie created' } };
        } catch (err) {
          if (err instanceof MovieConflictError) throw new ConflictError(err.message);
          throw err;
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = moviesService.updateMovie(db, params.id, body);
          return { status: 200 as const, body: { data: toMovie(row), message: 'Movie updated' } };
        } catch (err) {
          if (err instanceof MovieNotFoundError)
            throw new NotFoundError('Movie', String(params.id));
          throw err;
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          moviesService.deleteMovie(db, params.id);
          return { status: 200 as const, body: { message: 'Movie deleted' } };
        } catch (err) {
          if (err instanceof MovieNotFoundError)
            throw new NotFoundError('Movie', String(params.id));
          throw err;
        }
      }),
  };
}
