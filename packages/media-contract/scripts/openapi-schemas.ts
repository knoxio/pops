import { z } from 'zod';

import { MovieSchema } from '../src/schemas/movie.js';
import { refTo, type OpenApiSchema } from './openapi-types.js';

const PAGINATION_SCHEMA: OpenApiSchema = {
  type: 'object',
  required: ['total', 'limit', 'offset'],
  properties: {
    total: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1 },
    offset: { type: 'integer', minimum: 0 },
    hasMore: { type: 'boolean' },
  },
};

const CreateMovieBodySchema = z.object({
  title: z.string().min(1),
  year: z.number().int().nullable().optional(),
  tmdbId: z.string().nullable().optional(),
});

const UpdateMovieBodySchema = CreateMovieBodySchema.partial();

function zodToOpenApiSchema(schema: z.ZodType): OpenApiSchema {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    unrepresentable: 'any',
  }) as OpenApiSchema;
}

export function buildComponentSchemas(): Record<string, OpenApiSchema> {
  return {
    Pagination: PAGINATION_SCHEMA,
    Movie: zodToOpenApiSchema(MovieSchema),
    CreateMovieInput: zodToOpenApiSchema(CreateMovieBodySchema),
    UpdateMovieInput: zodToOpenApiSchema(UpdateMovieBodySchema),
    MovieListResponse: {
      type: 'object',
      required: ['data', 'pagination'],
      properties: {
        data: { type: 'array', items: refTo('Movie') },
        pagination: refTo('Pagination'),
      },
    },
    MovieResponse: {
      type: 'object',
      required: ['data'],
      properties: {
        data: refTo('Movie'),
        message: { type: 'string' },
      },
    },
    DeleteResponse: {
      type: 'object',
      required: ['message'],
      properties: { message: { type: 'string' } },
    },
  };
}
