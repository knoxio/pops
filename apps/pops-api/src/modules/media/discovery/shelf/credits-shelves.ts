import { eq, sql } from 'drizzle-orm';

/**
 * "More from {Director}" and "More from {Actor}" shelf implementations.
 *
 * Both shelves seed from movies with above-median ELO scores in the user's library.
 * Credits (crew + cast) are fetched from TMDB and cached in-memory per movie.
 * Director shelf queries /discover/movie?with_crew={personId}.
 * Actor shelf queries /discover/movie?with_cast={personId}.
 */
import { mediaScores, movies } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { getTmdbClient } from '../../tmdb/index.js';
import { getDismissedTmdbIds, getWatchedTmdbIds, getWatchlistTmdbIds } from '../flags.js';
import { scoreDiscoverResults } from '../service.js';
import { getLibraryTmdbIds, toDiscoverResults } from '../tmdb-service.js';
import { registerShelf } from './registry.js';

import type { TmdbMovieCredits } from '../../tmdb/types.js';
import type { PreferenceProfile } from '../types.js';
import type { ShelfDefinition, ShelfInstance } from './types.js';

const MAX_SEEDS = 10;
const LEAD_CAST_COUNT = 3;

/** In-memory credits cache: tmdbId → credits. Persists for server lifetime. */
const creditsCache = new Map<number, TmdbMovieCredits>();

interface SeedMovie {
  id: number;
  tmdbId: number;
  title: string;
  avgEloScore: number | null;
}

/**
 * Select movies with above-median ELO score from the library.
 * Returns up to MAX_SEEDS movies ordered by ELO descending.
 */
function selectSeedMovies(): SeedMovie[] {
  const db = getDrizzle();

  // Get all movies with their avg ELO scores
  const rows = db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      avgEloScore: sql<number | null>`ROUND(AVG(${mediaScores.score}), 1)`,
    })
    .from(movies)
    .leftJoin(mediaScores, eq(mediaScores.mediaId, movies.id))
    .groupBy(movies.id)
    .all();

  if (rows.length === 0) return [];

  // Compute median ELO
  const withScores = rows.filter((r) => r.avgEloScore != null);
  if (withScores.length === 0) {
    // No scores at all — return first MAX_SEEDS movies
    return rows.slice(0, MAX_SEEDS).map((r) => ({
      id: r.id,
      tmdbId: r.tmdbId,
      title: r.title,
      avgEloScore: null,
    }));
  }

  const sorted = [...withScores].toSorted((a, b) => (a.avgEloScore ?? 0) - (b.avgEloScore ?? 0));
  const median = sorted[Math.floor(sorted.length / 2)]?.avgEloScore ?? 0;

  // Filter above-median, sort descending by ELO, cap at MAX_SEEDS
  return withScores
    .filter((r) => (r.avgEloScore ?? 0) >= median)
    .toSorted((a, b) => (b.avgEloScore ?? 0) - (a.avgEloScore ?? 0))
    .slice(0, MAX_SEEDS)
    .map((r) => ({ id: r.id, tmdbId: r.tmdbId, title: r.title, avgEloScore: r.avgEloScore }));
}

/** Compute a relevance score (0–1) from a seed's ELO. */
function computeSeedScore(avgEloScore: number | null): number {
  if (avgEloScore == null) return 0.5;
  return Math.min(1, avgEloScore / 2000);
}

/** Fetch movie credits from cache or TMDB. */
async function getCachedCredits(tmdbId: number): Promise<TmdbMovieCredits> {
  const cached = creditsCache.get(tmdbId);
  if (cached) return cached;
  const client = getTmdbClient();
  const credits = await client.getMovieCredits(tmdbId);
  creditsCache.set(tmdbId, credits);
  return credits;
}

/** Extract the director from credits (crew, job=Director). Returns null if not found. */
function extractDirector(credits: TmdbMovieCredits): { id: number; name: string } | null {
  const director = credits.crew.find((c) => c.job === 'Director');
  return director ? { id: director.id, name: director.name } : null;
}

/** Extract lead cast (first LEAD_CAST_COUNT by order). */
function extractLeadCast(credits: TmdbMovieCredits): { id: number; name: string }[] {
  return credits.cast
    .filter((c) => c.order < LEAD_CAST_COUNT)
    .toSorted((a, b) => a.order - b.order)
    .map((c) => ({ id: c.id, name: c.name }));
}

function buildDirectorInstance(seed: SeedMovie, profile: PreferenceProfile): ShelfInstance {
  const cached = creditsCache.get(seed.tmdbId);
  const director = cached ? extractDirector(cached) : null;

  const title = director ? `More from ${director.name}` : `More from the director of ${seed.title}`;
  const score = computeSeedScore(seed.avgEloScore);

  return {
    shelfId: `more-from-director:${seed.id}`,
    title,
    subtitle: director ? `Films directed by ${director.name}` : undefined,
    emoji: '🎬',
    score,
    seedMovieId: seed.id,
    query: async ({ limit, offset }) => {
      const credits = await getCachedCredits(seed.tmdbId);
      const dir = extractDirector(credits);
      if (!dir) return [];

      const client = getTmdbClient();
      const page = Math.floor(offset / 20) + 1;

      const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
        client.discoverMoviesByCrew(dir.id, page),
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

function buildActorInstance(
  seed: SeedMovie,
  actorIndex: number,
  profile: PreferenceProfile
): ShelfInstance {
  const cached = creditsCache.get(seed.tmdbId);
  const leadCast = cached ? extractLeadCast(cached) : [];
  const actor = leadCast[actorIndex] ?? null;

  const title = actor ? `More from ${actor.name}` : `More from cast of ${seed.title}`;
  const score = computeSeedScore(seed.avgEloScore);

  return {
    shelfId: `more-from-actor:${seed.id}:${actorIndex}`,
    title,
    subtitle: actor ? `Films featuring ${actor.name}` : undefined,
    emoji: '🎭',
    score,
    seedMovieId: seed.id,
    query: async ({ limit, offset }) => {
      const credits = await getCachedCredits(seed.tmdbId);
      const cast = extractLeadCast(credits);
      const act = cast[actorIndex];
      if (!act) return [];

      const client = getTmdbClient();
      const page = Math.floor(offset / 20) + 1;

      const [response, libraryIds, watchedIds, watchlistIds, dismissedIds] = await Promise.all([
        client.discoverMoviesByCast(act.id, page),
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

export const moreFromDirectorShelf: ShelfDefinition = {
  id: 'more-from-director',
  template: true,
  category: 'seed',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const seeds = selectSeedMovies();
    return seeds.map((seed) => buildDirectorInstance(seed, profile));
  },
};

export const moreFromActorShelf: ShelfDefinition = {
  id: 'more-from-actor',
  template: true,
  category: 'seed',
  generate(profile: PreferenceProfile): ShelfInstance[] {
    const seeds = selectSeedMovies();
    // One instance per seed per lead actor position (up to LEAD_CAST_COUNT)
    const instances: ShelfInstance[] = [];
    for (const seed of seeds) {
      for (let i = 0; i < LEAD_CAST_COUNT; i++) {
        instances.push(buildActorInstance(seed, i, profile));
      }
    }
    return instances;
  },
};

registerShelf(moreFromDirectorShelf);
registerShelf(moreFromActorShelf);

/** Exposed for testing only. */
export const _creditsCache = creditsCache;
