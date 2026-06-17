/**
 * `tv-shows.*` sub-router — TV-show CRUD plus nested seasons & episodes.
 *
 * Wire shapes mirror the legacy `media.tv-shows.*` tRPC router. Seasons and
 * episodes are nested under their parents on create/list; deletes target the
 * resource directly. Numeric ids are coerced from the path.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, IdParam, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';
import { EpisodeSchema, SeasonSchema, TvShowSchema } from './rest-tv-shows-schemas.js';

const c = initContract();

const TvShowQuery = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});

const CreateTvShowBody = z.object({
  tvdbId: z.number().int().positive(),
  name: z.string().min(1, 'Name is required'),
  originalName: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  firstAirDate: z.string().nullable().optional(),
  lastAirDate: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  numberOfSeasons: z.number().int().nullable().optional(),
  numberOfEpisodes: z.number().int().nullable().optional(),
  episodeRunTime: z.number().int().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  posterOverridePath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  voteCount: z.number().int().nullable().optional(),
  genres: z.array(z.string()).optional(),
  networks: z.array(z.string()).optional(),
});

const UpdateTvShowBody = CreateTvShowBody.partial();

const CreateSeasonBody = z.object({
  tvdbId: z.number().int().positive(),
  seasonNumber: z.number().int().nonnegative(),
  name: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  airDate: z.string().nullable().optional(),
  episodeCount: z.number().int().nullable().optional(),
});

const CreateEpisodeBody = z.object({
  tvdbId: z.number().int().positive(),
  episodeNumber: z.number().int().nonnegative(),
  name: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  airDate: z.string().nullable().optional(),
  stillPath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  runtime: z.number().int().nullable().optional(),
});

const TvShowMutation = z.object({ data: TvShowSchema, message: z.string() });
const SeasonMutation = z.object({ data: SeasonSchema, message: z.string() });
const EpisodeMutation = z.object({ data: EpisodeSchema, message: z.string() });

export const mediaTvShowsContract = c.router({
  list: {
    method: 'GET',
    path: '/tv-shows',
    query: TvShowQuery,
    responses: {
      200: z.object({ data: z.array(TvShowSchema), pagination: PaginationMetaSchema }),
    },
    summary: 'List TV shows with optional search / status filters and pagination',
  },
  get: {
    method: 'GET',
    path: '/tv-shows/:id',
    pathParams: z.object({ id: IdParam }),
    responses: { 200: z.object({ data: TvShowSchema }), ...ERR_RESPONSES },
    summary: 'Get a single TV show by id',
  },
  create: {
    method: 'POST',
    path: '/tv-shows',
    body: CreateTvShowBody,
    responses: { 201: TvShowMutation, ...ERR_RESPONSES },
    summary: 'Create a TV show',
  },
  update: {
    method: 'PATCH',
    path: '/tv-shows/:id',
    pathParams: z.object({ id: IdParam }),
    body: UpdateTvShowBody,
    responses: { 200: TvShowMutation, ...ERR_RESPONSES },
    summary: 'Update a TV show',
  },
  delete: {
    method: 'DELETE',
    path: '/tv-shows/:id',
    pathParams: z.object({ id: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a TV show',
  },
  listSeasons: {
    method: 'GET',
    path: '/tv-shows/:tvShowId/seasons',
    pathParams: z.object({ tvShowId: IdParam }),
    responses: {
      200: z.object({ data: z.array(SeasonSchema), total: z.number() }),
      ...ERR_RESPONSES,
    },
    summary: 'List the seasons of a TV show',
  },
  createSeason: {
    method: 'POST',
    path: '/tv-shows/:tvShowId/seasons',
    pathParams: z.object({ tvShowId: IdParam }),
    body: CreateSeasonBody,
    responses: { 201: SeasonMutation, ...ERR_RESPONSES },
    summary: 'Create a season under a TV show',
  },
  deleteSeason: {
    method: 'DELETE',
    path: '/seasons/:id',
    pathParams: z.object({ id: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a season',
  },
  listEpisodes: {
    method: 'GET',
    path: '/seasons/:seasonId/episodes',
    pathParams: z.object({ seasonId: IdParam }),
    responses: {
      200: z.object({ data: z.array(EpisodeSchema), total: z.number() }),
      ...ERR_RESPONSES,
    },
    summary: 'List the episodes of a season',
  },
  createEpisode: {
    method: 'POST',
    path: '/seasons/:seasonId/episodes',
    pathParams: z.object({ seasonId: IdParam }),
    body: CreateEpisodeBody,
    responses: { 201: EpisodeMutation, ...ERR_RESPONSES },
    summary: 'Create an episode under a season',
  },
  deleteEpisode: {
    method: 'DELETE',
    path: '/episodes/:id',
    pathParams: z.object({ id: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete an episode',
  },
});
