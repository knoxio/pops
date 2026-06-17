/**
 * Handlers for the `tv-shows.*` sub-router (TV shows + nested seasons &
 * episodes). Thin wrappers over `@pops/media` `tvShowsService` /
 * `seasonsService` / `episodesService`; db domain errors map to 404 / 409.
 */
import {
  EpisodeConflictError,
  EpisodeNotFoundError,
  episodesService,
  type MediaDb,
  SeasonConflictError,
  SeasonNotFoundError,
  seasonsService,
  TvShowConflictError,
  TvShowNotFoundError,
  tvShowsService,
} from '../../db/index.js';
import { toEpisode, toSeason, toTvShow } from '../modules/tv-show-types.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaTvShowsContract } from '../../contract/rest-tv-shows.js';

type Req = ServerInferRequest<typeof mediaTvShowsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export function makeTvShowsHandlers(db: MediaDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = tvShowsService.listTvShows(
          db,
          { search: query.search, status: query.status },
          limit,
          offset
        );
        return {
          status: 200 as const,
          body: { data: rows.map(toTvShow), pagination: paginationMeta(total, limit, offset) },
        };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          return {
            status: 200 as const,
            body: { data: toTvShow(tvShowsService.getTvShow(db, params.id)) },
          };
        } catch (err) {
          if (err instanceof TvShowNotFoundError)
            throw new NotFoundError('TV show', String(params.id));
          throw err;
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        try {
          const row = tvShowsService.createTvShow(db, body);
          return {
            status: 201 as const,
            body: { data: toTvShow(row), message: 'TV show created' },
          };
        } catch (err) {
          if (err instanceof TvShowConflictError) throw new ConflictError(err.message);
          throw err;
        }
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = tvShowsService.updateTvShow(db, params.id, body);
          return {
            status: 200 as const,
            body: { data: toTvShow(row), message: 'TV show updated' },
          };
        } catch (err) {
          if (err instanceof TvShowNotFoundError)
            throw new NotFoundError('TV show', String(params.id));
          throw err;
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          tvShowsService.deleteTvShow(db, params.id);
          return { status: 200 as const, body: { message: 'TV show deleted' } };
        } catch (err) {
          if (err instanceof TvShowNotFoundError)
            throw new NotFoundError('TV show', String(params.id));
          throw err;
        }
      }),

    listSeasons: ({ params }: Req['listSeasons']) =>
      runHttp(() => {
        try {
          const { rows, total } = seasonsService.listSeasons(db, params.tvShowId);
          return { status: 200 as const, body: { data: rows.map(toSeason), total } };
        } catch (err) {
          if (err instanceof TvShowNotFoundError)
            throw new NotFoundError('TV show', String(params.tvShowId));
          throw err;
        }
      }),

    createSeason: ({ params, body }: Req['createSeason']) =>
      runHttp(() => {
        try {
          const row = seasonsService.createSeason(db, { ...body, tvShowId: params.tvShowId });
          return { status: 201 as const, body: { data: toSeason(row), message: 'Season created' } };
        } catch (err) {
          if (err instanceof TvShowNotFoundError)
            throw new NotFoundError('TV show', String(params.tvShowId));
          if (err instanceof SeasonConflictError) throw new ConflictError(err.message);
          throw err;
        }
      }),

    deleteSeason: ({ params }: Req['deleteSeason']) =>
      runHttp(() => {
        try {
          seasonsService.deleteSeason(db, params.id);
          return { status: 200 as const, body: { message: 'Season deleted' } };
        } catch (err) {
          if (err instanceof SeasonNotFoundError)
            throw new NotFoundError('Season', String(params.id));
          throw err;
        }
      }),

    listEpisodes: ({ params }: Req['listEpisodes']) =>
      runHttp(() => {
        try {
          const { rows, total } = episodesService.listEpisodes(db, params.seasonId);
          return { status: 200 as const, body: { data: rows.map(toEpisode), total } };
        } catch (err) {
          if (err instanceof SeasonNotFoundError)
            throw new NotFoundError('Season', String(params.seasonId));
          throw err;
        }
      }),

    createEpisode: ({ params, body }: Req['createEpisode']) =>
      runHttp(() => {
        try {
          const row = episodesService.createEpisode(db, { ...body, seasonId: params.seasonId });
          return {
            status: 201 as const,
            body: { data: toEpisode(row), message: 'Episode created' },
          };
        } catch (err) {
          if (err instanceof SeasonNotFoundError)
            throw new NotFoundError('Season', String(params.seasonId));
          if (err instanceof EpisodeConflictError) throw new ConflictError(err.message);
          throw err;
        }
      }),

    deleteEpisode: ({ params }: Req['deleteEpisode']) =>
      runHttp(() => {
        try {
          episodesService.deleteEpisode(db, params.id);
          return { status: 200 as const, body: { message: 'Episode deleted' } };
        } catch (err) {
          if (err instanceof EpisodeNotFoundError)
            throw new NotFoundError('Episode', String(params.id));
          throw err;
        }
      }),
  };
}
