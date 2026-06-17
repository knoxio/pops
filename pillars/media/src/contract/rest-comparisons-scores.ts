/**
 * Score / ranking / staleness / tier-list route definitions for the
 * `comparisons.*` sub-router. Split from `rest-comparisons.ts` to keep both
 * files within the per-file line cap; spread into the composer there.
 */
import { z } from 'zod';

import {
  DimensionExclusionBody,
  MediaScoreSchema,
  RankedMediaEntrySchema,
  RankingsQuery,
  ScoresQuery,
  StalenessBody,
  StalenessQuery,
  SubmitTierListBody,
  SubmitTierListResultSchema,
  TierListMovieSchema,
} from './rest-comparisons-schemas.js';
import { ERR_RESPONSES, IdParam, MessageSchema, PaginationMetaSchema } from './rest-schemas.js';

export const comparisonScoreRoutes = {
  scores: {
    method: 'GET',
    path: '/comparison-scores',
    query: ScoresQuery,
    responses: { 200: z.object({ data: z.array(MediaScoreSchema) }), ...ERR_RESPONSES },
    summary: 'Get ELO scores for a media item (optionally one dimension)',
  },
  rankings: {
    method: 'GET',
    path: '/comparison-rankings',
    query: RankingsQuery,
    responses: {
      200: z.object({ data: z.array(RankedMediaEntrySchema), pagination: PaginationMetaSchema }),
    },
    summary: 'Ranked media by ELO (per-dimension or overall, weight-blended)',
  },
  excludeFromDimension: {
    method: 'POST',
    path: '/comparison-scores/exclude',
    body: DimensionExclusionBody,
    responses: { 200: z.object({ comparisonsDeleted: z.number() }), ...ERR_RESPONSES },
    summary: 'Exclude a media item from a dimension (purges comparisons, recalc ELO)',
  },
  includeInDimension: {
    method: 'POST',
    path: '/comparison-scores/include',
    body: DimensionExclusionBody,
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Re-include a media item in a dimension',
  },
  markStale: {
    method: 'POST',
    path: '/comparison-staleness/mark',
    body: StalenessBody,
    responses: { 200: z.object({ data: z.object({ staleness: z.number() }) }), ...ERR_RESPONSES },
    summary: 'Mark a media item stale (×0.5 per call, floor 0.01)',
  },
  getStaleness: {
    method: 'GET',
    path: '/comparison-staleness',
    query: StalenessQuery,
    responses: { 200: z.object({ data: z.object({ staleness: z.number() }) }) },
    summary: 'Get staleness for a media item (default 1.0 = fresh)',
  },
  getTierListMovies: {
    method: 'GET',
    path: '/tier-list/:dimensionId',
    pathParams: z.object({ dimensionId: IdParam }),
    responses: { 200: z.object({ data: z.array(TierListMovieSchema) }), ...ERR_RESPONSES },
    summary: 'Get up to N movies for a tier-list placement round',
  },
  submitTierList: {
    method: 'POST',
    path: '/tier-list',
    body: SubmitTierListBody,
    responses: {
      200: z.object({ data: SubmitTierListResultSchema, message: z.string() }),
      ...ERR_RESPONSES,
    },
    summary: 'Submit a tier list: placements → comparisons + tier overrides',
  },
} as const;
