/**
 * `comparisons.*` sub-router — the ranking engine wire surface: dimensions,
 * pairwise comparisons (ELO), media scores, rankings, smart/random pairs,
 * exclusion, staleness, and tier lists.
 *
 * Wire shapes mirror the legacy `media.comparisons.*` tRPC router exactly
 * (`toDimension` / `toComparison` / `toMediaScore` + the pair/ranking/tier
 * handler outputs) so the REST cutover is transparent to the FE.
 *
 * Route order matters: literal sub-paths (`/comparisons/for-media`,
 * `/comparisons/smart-pair`, `/comparisons/batch`, `/comparisons/skip`,
 * `/comparisons/blacklist-movie`, `/comparisons/recalc-all`) are declared
 * BEFORE `/comparisons/:id` so the Express adapter doesn't capture them as the
 * `:id` segment.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  BatchRecordBody,
  BatchRecordResultSchema,
  BlacklistMovieBody,
  BlacklistMovieResultSchema,
  ComparisonSchema,
  CreateDimensionBody,
  DimensionSchema,
  ListAllQuery,
  ListForMediaQuery,
  RecordComparisonBody,
  RecordSkipBody,
  SmartPairQuery,
  SmartPairSchema,
  UpdateDimensionBody,
} from './rest-comparisons-schemas.js';
import { comparisonScoreRoutes } from './rest-comparisons-scores.js';
import { ERR_RESPONSES, IdParam, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';

const c = initContract();

export const mediaComparisonsContract = c.router({
  listDimensions: {
    method: 'GET',
    path: '/comparison-dimensions',
    responses: { 200: z.object({ data: z.array(DimensionSchema) }) },
    summary: 'List comparison dimensions ordered by sort order (seeds defaults if empty)',
  },
  createDimension: {
    method: 'POST',
    path: '/comparison-dimensions',
    body: CreateDimensionBody,
    responses: {
      201: z.object({ data: DimensionSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Create a comparison dimension',
  },
  updateDimension: {
    method: 'PATCH',
    path: '/comparison-dimensions/:id',
    pathParams: z.object({ id: IdParam }),
    body: UpdateDimensionBody,
    responses: { 200: z.object({ data: DimensionSchema, message: z.string() }), ...ERR_RESPONSES },
    summary: 'Update a comparison dimension',
  },

  record: {
    method: 'POST',
    path: '/comparisons',
    body: RecordComparisonBody,
    responses: {
      201: z.object({ data: ComparisonSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Record a 1v1 comparison and update ELO on both media',
  },
  listForMedia: {
    method: 'GET',
    path: '/comparisons/for-media',
    query: ListForMediaQuery,
    responses: {
      200: z.object({ data: z.array(ComparisonSchema), pagination: PaginationMetaSchema }),
      ...ERR_RESPONSES,
    },
    summary: 'List comparisons involving a media item',
  },
  getSmartPair: {
    method: 'GET',
    path: '/comparisons/smart-pair',
    query: SmartPairQuery,
    responses: {
      200: z.object({
        data: SmartPairSchema.nullable(),
        reason: z.enum(['insufficient_watched_movies']).nullable(),
      }),
      ...ERR_RESPONSES,
    },
    summary: 'Pick a smart comparison pair (weighted-probabilistic, with random fallback)',
  },
  batchRecordComparisons: {
    method: 'POST',
    path: '/comparisons/batch',
    body: BatchRecordBody,
    responses: {
      201: z.object({ data: BatchRecordResultSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Record a batch of comparisons in one transaction',
  },
  recordSkip: {
    method: 'POST',
    path: '/comparisons/skip',
    body: RecordSkipBody,
    responses: {
      200: z.object({ data: z.object({ skipUntil: z.number() }), message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Record a skip (puts the pair on cooloff for 10 global comparisons)',
  },
  blacklistMovie: {
    method: 'POST',
    path: '/comparisons/blacklist-movie',
    body: BlacklistMovieBody,
    responses: {
      200: z.object({ data: BlacklistMovieResultSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Blacklist a movie: mark watch events, purge its comparisons, recalc ELO',
  },
  recalcAll: {
    method: 'POST',
    path: '/comparisons/recalc-all',
    body: z.object({}).optional(),
    responses: {
      200: z.object({
        data: z.object({ dimensionsRecalculated: z.number() }),
        message: z.string(),
      }),
    },
    summary: 'Replay every comparison and recalc ELO for all active dimensions',
  },
  listAll: {
    method: 'GET',
    path: '/comparisons',
    query: ListAllQuery,
    responses: {
      200: z.object({ data: z.array(ComparisonSchema), pagination: PaginationMetaSchema }),
    },
    summary: 'List all comparisons (optional dimension + movie-title search)',
  },
  delete: {
    method: 'DELETE',
    path: '/comparisons/:id',
    pathParams: z.object({ id: IdParam }),
    body: z.object({}).optional(),
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Delete a comparison and recalc the affected dimension',
  },

  ...comparisonScoreRoutes,
});
