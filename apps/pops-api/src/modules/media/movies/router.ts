/**
 * Movie tRPC router — CRUD procedures for movies.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { ConflictError, NotFoundError } from '../../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../../shared/pagination.js';
import { protectedProcedure, router } from '../../../trpc.js';
import * as service from './service.js';
import {
  CreateMovieSchema,
  type MovieFilters,
  MovieQuerySchema,
  MovieSchema,
  toMovie,
  UpdateMovieSchema,
} from './types.js';

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const moviesRouter = router({
  /** List movies with optional filters and pagination. */
  list: protectedProcedure
    .meta({
      openapi: { method: 'GET', path: '/media/movies', summary: 'List movies', tags: ['movies'] },
    })
    .input(MovieQuerySchema)
    .output(z.object({ data: z.array(MovieSchema), pagination: PaginationMetaSchema }))
    .query(({ input }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const filters: MovieFilters = {
        search: input.search,
        genre: input.genre,
      };

      const { rows, total } = service.listMovies(filters, limit, offset);

      return {
        data: rows.map(toMovie),
        pagination: paginationMeta(total, limit, offset),
      };
    }),

  /** Get a single movie by ID. */
  get: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/media/movies/{id}',
        summary: 'Get movie by ID',
        tags: ['movies'],
      },
    })
    .input(z.object({ id: z.number() }))
    .output(z.object({ data: MovieSchema }))
    .query(({ input }) => {
      try {
        const row = service.getMovie(input.id);
        return { data: toMovie(row) };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** Create a new movie. */
  create: protectedProcedure.input(CreateMovieSchema).mutation(({ input }) => {
    try {
      const row = service.createMovie(input);
      return {
        data: toMovie(row),
        message: 'Movie created',
      };
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: 'CONFLICT', message: err.message });
      }
      throw err;
    }
  }),

  /** Update an existing movie. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        data: UpdateMovieSchema,
      })
    )
    .mutation(({ input }) => {
      try {
        const row = service.updateMovie(input.id, input.data);
        return {
          data: toMovie(row),
          message: 'Movie updated',
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
        }
        throw err;
      }
    }),

  /** Delete a movie. */
  delete: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    try {
      service.deleteMovie(input.id);
      return { message: 'Movie deleted' };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message });
      }
      throw err;
    }
  }),
});
