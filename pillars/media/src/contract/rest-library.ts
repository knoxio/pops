/**
 * `library.*` sub-router — the combined movies + TV-shows library grid.
 *
 * Read-only slice: list (paginated, page-based), genres, and quick-pick. The
 * add/refresh mutations stay in the monolith until the TMDB/TheTVDB clients
 * land in the pillar (wave 2). Wire shapes mirror the legacy
 * `media.library.list|genres|quickPick`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { MovieSchema } from './rest-movies.js';

const c = initContract();

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
});
