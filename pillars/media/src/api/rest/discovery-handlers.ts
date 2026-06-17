/**
 * Handlers for the `discovery.*` sub-router.
 *
 * Thin wrappers over the discovery db services (dismiss pile, profile, quick
 * pick, rewatch, from-your-server) and the api-layer orchestration (trending,
 * recommendations, context picks, genre spotlight, session assembly + paging).
 * The TMDB client is resolved here via its env-configured factory and injected
 * into the orchestration as `{ db, tmdbClient }`.
 *
 * `trendingPlex` is a STUB returning `{ data: null }` — the monolith already
 * returned null when Plex was unavailable, and the Plex Discover client is not
 * ported yet (wave-3 follow-up).
 */
import {
  type MediaDb,
  dismissedDiscoverService,
  discoveryService,
  libraryService,
} from '../../db/index.js';
import { getTmdbClient } from '../clients/tmdb/index.js';
import { runAssembleSession, runGetShelfPage } from '../modules/discovery/assemble-session.js';
import { getFromYourServer, getScoredRecommendations } from '../modules/discovery/basic.js';
import { parseContextPages } from '../modules/discovery/context-pages.js';
import { getContextPicks } from '../modules/discovery/context-picks.js';
import { type DiscoveryDeps } from '../modules/discovery/deps.js';
import { getGenreSpotlight, getGenreSpotlightPage } from '../modules/discovery/genre-spotlight.js';
import { toMovieQuickPick } from '../modules/discovery/quick-pick.js';
import { getWatchlistRecommendations } from '../modules/discovery/recommendations.js';
import { getTrending } from '../modules/discovery/trending.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { mediaDiscoveryContract } from '../../contract/rest-discovery.js';

type Req = ServerInferRequest<typeof mediaDiscoveryContract>;

const DEFAULT_QUICK_PICK = 3;
const DEFAULT_TRENDING_WINDOW = 'week' as const;
const DEFAULT_TRENDING_PAGE = 1;
const DEFAULT_SAMPLE_SIZE = 3;

function deps(db: MediaDb): DiscoveryDeps {
  return { db, tmdbClient: getTmdbClient() };
}

export function makeDiscoveryHandlers(db: MediaDb) {
  return {
    getDismissed: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: dismissedDiscoverService.listDismissedTmdbIds(db) },
      })),

    dismiss: ({ body }: Req['dismiss']) =>
      runHttp(() => {
        dismissedDiscoverService.dismiss(db, body.tmdbId);
        return { status: 200 as const, body: { message: 'Dismissed' } };
      }),

    undismiss: ({ body }: Req['undismiss']) =>
      runHttp(() => {
        dismissedDiscoverService.undismiss(db, body.tmdbId);
        return { status: 200 as const, body: { message: 'Undismissed' } };
      }),

    profile: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: discoveryService.getPreferenceProfile(db) },
      })),

    quickPick: ({ query }: Req['quickPick']) =>
      runHttp(() => ({
        status: 200 as const,
        body: {
          data: libraryService
            .getQuickPicks(db, query.count ?? DEFAULT_QUICK_PICK)
            .map(toMovieQuickPick),
        },
      })),

    rewatchSuggestions: () =>
      runHttp(() => ({
        status: 200 as const,
        body: { data: discoveryService.getRewatchSuggestions(db) },
      })),

    fromYourServer: () => runHttp(() => ({ status: 200 as const, body: getFromYourServer(db) })),

    trending: ({ query }: Req['trending']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await getTrending(
          deps(db),
          query.timeWindow ?? DEFAULT_TRENDING_WINDOW,
          query.page ?? DEFAULT_TRENDING_PAGE
        ),
      })),

    trendingPlex: () => runHttp(() => ({ status: 200 as const, body: { data: null } })),

    watchlistRecommendations: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: await getWatchlistRecommendations(deps(db)),
      })),

    recommendations: ({ query }: Req['recommendations']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await getScoredRecommendations(deps(db), query.sampleSize ?? DEFAULT_SAMPLE_SIZE),
      })),

    contextPicks: ({ query }: Req['contextPicks']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await getContextPicks(deps(db), parseContextPages(query.pages)),
      })),

    genreSpotlight: () =>
      runHttp(async () => ({
        status: 200 as const,
        body: await getGenreSpotlight(deps(db)),
      })),

    genreSpotlightPage: ({ query }: Req['genreSpotlightPage']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await getGenreSpotlightPage(deps(db), query.genreId, query.page),
      })),

    assembleSession: () =>
      runHttp(async () => ({ status: 200 as const, body: await runAssembleSession(deps(db)) })),

    getShelfPage: ({ params, query }: Req['getShelfPage']) =>
      runHttp(async () => ({
        status: 200 as const,
        body: await runGetShelfPage(deps(db), params.shelfId, query.limit ?? 20, query.offset ?? 0),
      })),
  };
}
