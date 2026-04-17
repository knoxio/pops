import { and, eq, sql } from 'drizzle-orm';

/**
 * "Because you watched {Movie}" shelf implementation.
 *
 * Seeds from the user's watch history: 60% from last 30 days, 40% from older watches.
 * Each seed generates one ShelfInstance that queries TMDB recommendations for that movie.
 * Instance score is derived from genre alignment between the seed movie and the user profile.
 */
import { mediaScores, movies, watchHistory } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { getTmdbClient } from '../../tmdb/index.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from '../flags.js';
import { scoreDiscoverResults } from '../service.js';
import { getLibraryTmdbIds, toDiscoverResults } from '../tmdb-service.js';
import { registerShelf } from './registry.js';

import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

const MAX_SEEDS = 10;
const RECENT_DAYS = 30;
/** 60% of seeds come from recent watches (last 30 days). */
const RECENT_RATIO = 0.6;

interface SeedMovie {
  id: number;
  tmdbId: number;
  title: string;
  genres: string; // JSON string of genre names
  avgEloScore: number | null;
  watchedAt: string;
}

/**
 * Query watch history for completed movie watches.
 * Returns an array of recent and older seeds split by the 30-day boundary.
 */
function selectSeeds(): { recent: SeedMovie[]; older: SeedMovie[] } {
  const db = getDrizzle();

  const rows = db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      genres: movies.genres,
      avgEloScore: sql<number | null>`ROUND(AVG(${mediaScores.score}), 1)`,
      watchedAt: sql<string>`MAX(${watchHistory.watchedAt})`,
    })
    .from(watchHistory)
    .innerJoin(
      movies,
      and(eq(movies.id, watchHistory.mediaId), eq(watchHistory.mediaType, 'movie'))
    )
    .leftJoin(
      mediaScores,
      and(eq(mediaScores.mediaId, movies.id), eq(mediaScores.mediaType, 'movie'))
    )
    .where(eq(watchHistory.completed, 1))
    .groupBy(movies.id)
    .orderBy(sql`MAX(${watchHistory.watchedAt}) DESC`)
    .all();

  const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const recent: SeedMovie[] = [];
  const older: SeedMovie[] = [];

  for (const row of rows) {
    const seed: SeedMovie = {
      id: row.id,
      tmdbId: row.tmdbId,
      title: row.title,
      genres: row.genres ?? '[]',
      avgEloScore: row.avgEloScore,
      watchedAt: row.watchedAt,
    };
    if (row.watchedAt >= cutoff) {
      recent.push(seed);
    } else {
      older.push(seed);
    }
  }

  return { recent, older };
}

/** Fisher-Yates shuffle in place. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j] as T;
    arr[j] = tmp as T;
  }
  return arr;
}

/**
 * Compute a relevance score (0–1) for a seed movie based on genre alignment
 * with the user's preference profile.
 */
function computeSeedScore(seed: SeedMovie, profile: PreferenceProfile): number {
  // Use ELO as primary signal if available (normalised to 0–1 using 1500 baseline)
  const eloScore = seed.avgEloScore != null ? Math.min(1, seed.avgEloScore / 2000) : 0.5;

  // Genre alignment bonus from profile affinities
  let genreBonus = 0;
  if (profile.genreAffinities.length > 0) {
    const genreNames: string[] = (() => {
      try {
        return JSON.parse(seed.genres) as string[];
      } catch {
        return [];
      }
    })();
    if (genreNames.length > 0) {
      const maxAffinity = Math.max(...profile.genreAffinities.map((a) => a.avgScore));
      const minAffinity = Math.min(...profile.genreAffinities.map((a) => a.avgScore));
      const range = maxAffinity - minAffinity || 1;
      const affinityMap = new Map(
        profile.genreAffinities.map((a) => [a.genre, (a.avgScore - minAffinity) / range])
      );
      const scores = genreNames.map((g) => affinityMap.get(g) ?? 0);
      genreBonus = scores.reduce((sum, s) => sum + s, 0) / genreNames.length;
    }
  }

  // Blend ELO (70%) and genre bonus (30%)
  return Math.min(1, eloScore * 0.7 + genreBonus * 0.3);
}

function buildInstance(seed: SeedMovie, profile: PreferenceProfile): ShelfInstance {
  const score = computeSeedScore(seed, profile);

  return {
    shelfId: `because-you-watched:${seed.id}`,
    title: `Because you watched ${seed.title}`,
    subtitle: 'Movies similar to a recent watch',
    emoji: '🎬',
    score,
    seedMovieId: seed.id,
    query: async ({ limit, offset }) => {
      const client = getTmdbClient();
      const page = Math.floor(offset / 20) + 1;

      const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
        client.getMovieRecommendations(seed.tmdbId, page),
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

export const becauseYouWatchedShelf: ShelfDefinition = {
  id: 'because-you-watched',
  template: true,
  category: 'seed',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const { recent, older } = selectSeeds();

    const recentCount = Math.round(MAX_SEEDS * RECENT_RATIO);
    const olderCount = MAX_SEEDS - recentCount;

    const selectedRecent = shuffle(recent).slice(0, recentCount);
    const selectedOlder = shuffle(older).slice(0, olderCount);

    const seeds = [...selectedRecent, ...selectedOlder].slice(0, MAX_SEEDS);
    return seeds.map((seed) => buildInstance(seed, profile));
  },
};

registerShelf(becauseYouWatchedShelf);
