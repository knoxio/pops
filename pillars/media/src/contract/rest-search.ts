/**
 * `search.*` sub-router — live metadata search over the upstream providers
 * (TMDB movies + TheTVDB series). No database: each route is a thin
 * pass-through to the env-configured provider client. A provider outage
 * surfaces as 502 via `BadGatewayError`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/** Mirrors `TmdbSearchResult` from the TMDB client. */
const MovieSearchResultSchema = z.object({
  tmdbId: z.number(),
  title: z.string(),
  originalTitle: z.string(),
  overview: z.string(),
  releaseDate: z.string(),
  posterPath: z.string().nullable(),
  backdropPath: z.string().nullable(),
  voteAverage: z.number(),
  voteCount: z.number(),
  genreIds: z.array(z.number()),
  originalLanguage: z.string(),
  popularity: z.number(),
});

/** Mirrors `TvdbSearchResult` from the TheTVDB client. */
const TvShowSearchResultSchema = z.object({
  tvdbId: z.number(),
  name: z.string(),
  originalName: z.string().nullable(),
  overview: z.string().nullable(),
  firstAirDate: z.string().nullable(),
  status: z.string().nullable(),
  posterPath: z.string().nullable(),
  genres: z.array(z.string()),
  originalLanguage: z.string().nullable(),
  year: z.string().nullable(),
});

const MovieSearchQuery = z.object({
  query: z.string().min(1).max(200),
  page: z.coerce.number().int().positive().max(500).optional(),
});

const TvShowSearchQuery = z.object({
  query: z.string().min(1).max(200),
});

/** 502 carries the same error envelope as the 4xx mapped statuses. */
const UPSTREAM_ERR_RESPONSES = { 400: ErrorBodySchema, 502: ErrorBodySchema } as const;

export const mediaSearchContract = c.router({
  movies: {
    method: 'GET',
    path: '/search/movies',
    query: MovieSearchQuery,
    responses: {
      200: z.object({
        results: z.array(MovieSearchResultSchema),
        totalResults: z.number(),
        totalPages: z.number(),
        page: z.number(),
      }),
      ...UPSTREAM_ERR_RESPONSES,
    },
    summary: 'Search movies via TMDB',
  },
  tvShows: {
    method: 'GET',
    path: '/search/tv-shows',
    query: TvShowSearchQuery,
    responses: {
      200: z.object({ results: z.array(TvShowSearchResultSchema) }),
      ...UPSTREAM_ERR_RESPONSES,
    },
    summary: 'Search TV shows via TheTVDB',
  },
});
