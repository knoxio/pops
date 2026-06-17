/**
 * `discovery.*` sub-router — the discover surface: dismiss pile, preference
 * profile, quick pick, rewatch, from-your-server, TMDB trending /
 * recommendations / context picks / genre spotlight, and shelf session
 * assembly + paging.
 *
 * Ported from the monolith `media.discovery.*` tRPC routers (basic / tmdb /
 * shelf). Two paths are deliberately stubbed pending the Plex Discover client
 * (wave-3 follow-up): `trendingPlex` always returns `{ data: null }`, and the
 * Plex-backed `trending-plex` shelf is omitted from the session.
 *
 * Route order matters: literal sub-paths are declared before `:tmdbId` /
 * `:shelfId` params so the Express adapter doesn't capture them parametrically.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  AssembleSessionResultSchema,
  ContextPicksResultSchema,
  DismissBody,
  GenreSpotlightPageQuery,
  GenreSpotlightPageResultSchema,
  GenreSpotlightResultSchema,
  PreferenceProfileSchema,
  QuickPickMovieSchema,
  QuickPickQuery,
  RecommendationsQuery,
  RecommendationsResultSchema,
  RewatchSuggestionSchema,
  ScoredDiscoverResultSchema,
  ShelfPageQuery,
  ShelfPageResultSchema,
  TrendingQuery,
  TrendingResultSchema,
  WatchlistRecommendationsResultSchema,
} from './rest-discovery-schemas.js';
import { ERR_RESPONSES, MessageSchema } from './rest-schemas.js';

const c = initContract();

export const mediaDiscoveryContract = c.router({
  getDismissed: {
    method: 'GET',
    path: '/discovery/dismissed',
    responses: { 200: z.object({ data: z.array(z.number()) }) },
    summary: 'List dismissed TMDB ids',
  },
  dismiss: {
    method: 'POST',
    path: '/discovery/dismiss',
    body: DismissBody,
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Dismiss a movie from the discover surface (idempotent)',
  },
  undismiss: {
    method: 'POST',
    path: '/discovery/undismiss',
    body: DismissBody,
    responses: { 200: MessageSchema, ...ERR_RESPONSES },
    summary: 'Remove a movie from the dismiss pile',
  },

  profile: {
    method: 'GET',
    path: '/discovery/profile',
    responses: { 200: z.object({ data: PreferenceProfileSchema }) },
    summary: 'Computed preference profile (genre affinities, dimension weights, distribution)',
  },
  quickPick: {
    method: 'GET',
    path: '/discovery/quick-pick',
    query: QuickPickQuery,
    responses: { 200: z.object({ data: z.array(QuickPickMovieSchema) }) },
    summary: 'Random unwatched library movies for the quick-pick flow',
  },
  rewatchSuggestions: {
    method: 'GET',
    path: '/discovery/rewatch-suggestions',
    responses: { 200: z.object({ data: z.array(RewatchSuggestionSchema) }) },
    summary: 'Library movies watched 6+ months ago with high scores',
  },
  fromYourServer: {
    method: 'GET',
    path: '/discovery/from-your-server',
    responses: { 200: z.object({ results: z.array(ScoredDiscoverResultSchema) }) },
    summary: 'Unwatched library movies scored by the preference profile',
  },

  trending: {
    method: 'GET',
    path: '/discovery/trending',
    query: TrendingQuery,
    responses: { 200: TrendingResultSchema },
    summary: 'Trending movies from TMDB',
  },
  trendingPlex: {
    method: 'GET',
    path: '/discovery/trending-plex',
    query: z.object({ limit: z.coerce.number().int().positive().max(50).optional() }),
    responses: { 200: z.object({ data: z.null() }) },
    summary: 'Trending from Plex Discover (STUB: always null until the client lands)',
  },
  watchlistRecommendations: {
    method: 'GET',
    path: '/discovery/watchlist-recommendations',
    responses: { 200: WatchlistRecommendationsResultSchema },
    summary: 'Recommendations from watchlist movies via TMDB similar',
  },
  recommendations: {
    method: 'GET',
    path: '/discovery/recommendations',
    query: RecommendationsQuery,
    responses: { 200: RecommendationsResultSchema },
    summary: 'Recommendations from top-rated library movies, profile-scored',
  },
  contextPicks: {
    method: 'GET',
    path: '/discovery/context-picks',
    query: z.object({ pages: z.string().optional() }),
    responses: { 200: ContextPicksResultSchema, ...ERR_RESPONSES },
    summary: 'Time-of-day context picks (optional pages = JSON map of collectionId→page)',
  },
  genreSpotlightPage: {
    method: 'GET',
    path: '/discovery/genre-spotlight/page',
    query: GenreSpotlightPageQuery,
    responses: { 200: GenreSpotlightPageResultSchema, ...ERR_RESPONSES },
    summary: 'Load more results for one genre spotlight row',
  },
  genreSpotlight: {
    method: 'GET',
    path: '/discovery/genre-spotlight',
    responses: { 200: GenreSpotlightResultSchema },
    summary: 'Top user genres with high-rated TMDB movies',
  },

  assembleSession: {
    method: 'POST',
    path: '/discovery/session',
    body: z.object({}).optional(),
    responses: { 200: AssembleSessionResultSchema },
    summary: 'Assemble a discover session (generate → score → select → record impressions)',
  },
  getShelfPage: {
    method: 'GET',
    path: '/discovery/shelves/:shelfId',
    pathParams: z.object({ shelfId: z.string().min(1) }),
    query: ShelfPageQuery,
    responses: { 200: ShelfPageResultSchema, ...ERR_RESPONSES },
    summary: 'Page a single shelf instance by id',
  },
});
