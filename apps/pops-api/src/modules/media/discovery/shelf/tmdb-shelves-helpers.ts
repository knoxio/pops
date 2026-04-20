import { sql } from 'drizzle-orm';

import { movies, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { getTmdbClient } from '../../tmdb/index.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from '../flags.js';
import { scoreDiscoverResults } from '../service.js';
import { getLibraryTmdbIds, toDiscoverResults } from '../tmdb-service.js';
import { TMDB_GENRE_MAP } from '../types.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfInstance } from './types.js';

export const ACADEMY_AWARD_KEYWORD_ID = 154712;
export const GOLDEN_GLOBE_KEYWORD_ID = 156299;

/**
 * Map genre names from user profile affinities to TMDB genre IDs.
 * Uses the top N genres by avgScore.
 */
export function topGenreIds(profile: PreferenceProfile, limit = 3): number[] {
  const reverseMap = new Map<string, number>(
    Object.entries(TMDB_GENRE_MAP).map(([id, name]) => [name, Number(id)])
  );
  return profile.genreAffinities
    .slice()
    .toSorted((a, b) => b.avgScore - a.avgScore)
    .slice(0, limit)
    .map((a) => reverseMap.get(a.genre))
    .filter((id): id is number => id !== undefined);
}

/** Determine the decade (e.g. 1990) with the most completed movie watches. */
export function getMostWatchedDecade(): number {
  const db = getDrizzle();
  const rows = db
    .select({
      decade: sql<number>`CAST(SUBSTR(${movies.releaseDate}, 1, 3) AS INTEGER) * 10`,
      watchCount: sql<number>`COUNT(*)`,
    })
    .from(watchHistory)
    .innerJoin(movies, sql`${movies.id} = ${watchHistory.mediaId}`)
    .where(
      sql`${watchHistory.mediaType} = 'movie' AND ${watchHistory.completed} = 1 AND ${movies.releaseDate} IS NOT NULL AND LENGTH(${movies.releaseDate}) >= 4`
    )
    .groupBy(sql`CAST(SUBSTR(${movies.releaseDate}, 1, 3) AS INTEGER) * 10`)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(1)
    .all();
  return rows[0]?.decade ?? 1990;
}

export interface TmdbInstanceArgs {
  shelfId: string;
  title: string;
  subtitle: string;
  emoji: string;
  score: number;
  profile: PreferenceProfile;
  discoverOpts: (page: number) => Parameters<ReturnType<typeof getTmdbClient>['discoverMovies']>[0];
}

/** Build a ShelfInstance that calls discoverMovies with given opts. */
export function buildTmdbInstance(args: TmdbInstanceArgs): ShelfInstance {
  const { shelfId, title, subtitle, emoji, score, profile, discoverOpts } = args;
  return {
    shelfId,
    title,
    subtitle,
    emoji,
    score,
    query: async ({ limit, offset }) => {
      const client = getTmdbClient();
      const page = Math.floor(offset / 20) + 1;

      const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
        client.discoverMovies(discoverOpts(page)),
        Promise.resolve(getLibraryTmdbIds()),
        Promise.resolve(getWatchedTmdbIds()),
        Promise.resolve(getWatchlistTmdbIds()),
        Promise.resolve(getDismissedTmdbIds()),
      ]);

      const raw = toDiscoverResults(response.results, libraryIds, watchedIds, watchlistIds).filter(
        (r) => !dismissedIds.has(r.tmdbId)
      );

      const scored = scoreDiscoverResults(raw, profile);
      scored.sort((a, b) => b.matchPercentage - a.matchPercentage);

      const start = offset % 20;
      return scored.slice(start, start + limit);
    },
  };
}
