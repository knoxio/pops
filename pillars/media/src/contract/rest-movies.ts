/**
 * `movies.*` sub-router — movie CRUD.
 *
 * Response/body schemas mirror the legacy `media.movies.*` tRPC wire shapes
 * (`toMovie` + the create/update zod inputs) so the REST cutover is
 * transparent to the FE. Movie ids are numeric SQLite autoincrement keys;
 * `tmdbId` is the natural key enforced unique by the db layer.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, IdParam, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';

const c = initContract();

/** Wire shape served by the movie handlers (mirrors `toMovie`). */
export const MovieSchema = z.object({
  id: z.number(),
  tmdbId: z.number(),
  imdbId: z.string().nullable(),
  title: z.string(),
  originalTitle: z.string().nullable(),
  overview: z.string().nullable(),
  tagline: z.string().nullable(),
  releaseDate: z.string().nullable(),
  runtime: z.number().nullable(),
  status: z.string().nullable(),
  originalLanguage: z.string().nullable(),
  budget: z.number().nullable(),
  revenue: z.number().nullable(),
  posterPath: z.string().nullable(),
  posterUrl: z.string().nullable(),
  backdropPath: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  logoPath: z.string().nullable(),
  logoUrl: z.string().nullable(),
  posterOverridePath: z.string().nullable(),
  voteAverage: z.number().nullable(),
  voteCount: z.number().nullable(),
  genres: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  rotationStatus: z.enum(['leaving', 'protected']).nullable(),
  rotationExpiresAt: z.string().nullable(),
});

const CreateMovieBody = z.object({
  tmdbId: z.number().int().positive(),
  imdbId: z.string().nullable().optional(),
  title: z.string().min(1, 'Title is required'),
  originalTitle: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  runtime: z.number().int().positive().nullable().optional(),
  status: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  budget: z.number().int().nonnegative().nullable().optional(),
  revenue: z.number().int().nonnegative().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  posterOverridePath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  voteCount: z.number().int().nonnegative().nullable().optional(),
  genres: z.array(z.string()).optional().default([]),
});

const UpdateMovieBody = z.object({
  tmdbId: z.number().int().positive().optional(),
  imdbId: z.string().nullable().optional(),
  title: z.string().min(1, 'Title cannot be empty').optional(),
  originalTitle: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  runtime: z.number().int().positive().nullable().optional(),
  status: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  budget: z.number().int().nonnegative().nullable().optional(),
  revenue: z.number().int().nonnegative().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  posterOverridePath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  voteCount: z.number().int().nonnegative().nullable().optional(),
  genres: z.array(z.string()).optional(),
});

const MovieQuery = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  limit: z.coerce.number().positive().max(1000).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});

const MovieMutation = z.object({ data: MovieSchema, message: z.string() });

export const mediaMoviesContract = c.router({
  list: {
    method: 'GET',
    path: '/movies',
    query: MovieQuery,
    responses: {
      200: z.object({ data: z.array(MovieSchema), pagination: PaginationMetaSchema }),
    },
    summary: 'List movies with optional search / genre filters and pagination',
  },
  get: {
    method: 'GET',
    path: '/movies/:id',
    pathParams: z.object({ id: IdParam }),
    responses: { 200: z.object({ data: MovieSchema }), ...ERR_RESPONSES },
    summary: 'Get a single movie by id',
  },
  create: {
    method: 'POST',
    path: '/movies',
    body: CreateMovieBody,
    responses: { 201: MovieMutation, ...ERR_RESPONSES },
    summary: 'Create a movie',
  },
  update: {
    method: 'PATCH',
    path: '/movies/:id',
    pathParams: z.object({ id: IdParam }),
    body: UpdateMovieBody,
    responses: { 200: MovieMutation, ...ERR_RESPONSES },
    summary: 'Update a movie',
  },
  delete: {
    method: 'DELETE',
    path: '/movies/:id',
    pathParams: z.object({ id: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a movie',
  },
});
