/**
 * `library.*` sub-router — the combined movies + TV-shows library grid plus
 * the add/refresh ingestion mutations.
 *
 * Reads: list (paginated, page-based), genres, and quick-pick. Mutations:
 * addMovie / refreshMovie (TMDB) and addTvShow / refreshTvShow (TheTVDB).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { MovieSchema } from './rest-movies.js';
import { ERR_RESPONSES, IdParam } from './rest-schemas.js';
import { SeasonSchema, TvShowSchema } from './rest-tv-shows-schemas.js';

const c = initContract();

const AddMovieBody = z.object({ tmdbId: z.number().int().positive() });
const RefreshMovieBody = z.object({ redownloadImages: z.boolean().optional().default(false) });
const AddTvShowBody = z.object({ tvdbId: z.number().int().positive() });
const RefreshTvShowBody = z.object({
  redownloadImages: z.boolean().optional().default(false),
  refreshEpisodes: z.boolean().optional().default(true),
});

const TvShowWithSeasons = z.object({ show: TvShowSchema, seasons: z.array(SeasonSchema) });

const LibraryItemSchema = z.object({
  id: z.number(),
  type: z.enum(['movie', 'tv']),
  title: z.string(),
  year: z.number().nullable(),
  posterUrl: z.string().nullable(),
  cdnPosterUrl: z.string().nullable(),
  genres: z.array(z.string()),
  voteAverage: z.number().nullable(),
  createdAt: z.string(),
  releaseDate: z.string().nullable(),
});

const LibraryListQuery = z.object({
  type: z.enum(['all', 'movie', 'tv']).optional().default('all'),
  sort: z.enum(['title', 'dateAdded', 'releaseDate', 'rating']).optional().default('title'),
  search: z.string().optional(),
  genre: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(96).optional().default(24),
});

const QuickPickQuery = z.object({
  count: z.coerce.number().int().positive().max(10).optional().default(3),
});

export const mediaLibraryContract = c.router({
  list: {
    method: 'GET',
    path: '/library',
    query: LibraryListQuery,
    responses: {
      200: z.object({
        data: z.array(LibraryItemSchema),
        pagination: z.object({
          page: z.number(),
          pageSize: z.number(),
          total: z.number(),
          totalPages: z.number(),
          hasMore: z.boolean(),
        }),
      }),
    },
    summary: 'List the library (movies + TV shows) with filter / sort / pagination',
  },
  genres: {
    method: 'GET',
    path: '/library/genres',
    responses: { 200: z.object({ data: z.array(z.string()) }) },
    summary: 'List the distinct genres across the library',
  },
  quickPick: {
    method: 'GET',
    path: '/library/quick-pick',
    query: QuickPickQuery,
    responses: { 200: z.object({ data: z.array(MovieSchema) }) },
    summary: 'Random unwatched movies to surface as a quick pick',
  },
  addMovie: {
    method: 'POST',
    path: '/library/movies',
    body: AddMovieBody,
    responses: {
      200: z.object({ data: MovieSchema, created: z.boolean(), message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Add a movie to the library by TMDB id (idempotent)',
  },
  refreshMovie: {
    method: 'PATCH',
    path: '/library/movies/:id',
    pathParams: z.object({ id: IdParam }),
    body: RefreshMovieBody,
    responses: { 200: z.object({ data: MovieSchema, message: z.string() }), ...ERR_RESPONSES },
    summary: 'Refresh a library movie from TMDB',
  },
  addTvShow: {
    method: 'POST',
    path: '/library/tv-shows',
    body: AddTvShowBody,
    responses: {
      200: z.object({ data: TvShowWithSeasons, created: z.boolean(), message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Add a TV show to the library by TheTVDB id (idempotent)',
  },
  refreshTvShow: {
    method: 'PATCH',
    path: '/library/tv-shows/:id',
    pathParams: z.object({ id: IdParam }),
    body: RefreshTvShowBody,
    responses: {
      200: z.object({
        data: TvShowWithSeasons,
        episodesAdded: z.number(),
        episodesUpdated: z.number(),
        seasonsAdded: z.number(),
        seasonsUpdated: z.number(),
        message: z.string(),
      }),
      ...ERR_RESPONSES,
    },
    summary: 'Refresh a library TV show from TheTVDB',
  },
});
