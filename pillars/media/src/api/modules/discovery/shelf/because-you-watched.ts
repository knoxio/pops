/**
 * "Because you watched {Movie}" shelf.
 *
 * Seeds from watch history (60% from the last 30 days, 40% older). Each seed
 * generates one instance that queries TMDB recommendations for that movie,
 * scored by genre alignment with the profile.
 *
 * Ported from the monolith `shelf/because-you-watched.shelf.ts`.
 */
import { discoveryService, type PreferenceProfile } from '../../../../db/index.js';
import { type WatchedSeedMovie } from '../../../../db/services/discovery/index.js';
import { getMaxBecauseYouWatchedSeeds } from '../config.js';
import { scoredTmdbShelfQuery } from './shelf-query.js';

import type { DiscoveryDeps } from '../deps.js';
import type { ShelfDefinition, ShelfGenerateArgs, ShelfInstance } from './types.js';

const RECENT_DAYS = 30;
const RECENT_RATIO = 0.6;

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

/** Relevance (0–1) from ELO (70%) blended with genre alignment (30%). */
function computeSeedScore(seed: WatchedSeedMovie, profile: PreferenceProfile): number {
  const eloScore = seed.avgEloScore != null ? Math.min(1, seed.avgEloScore / 2000) : 0.5;

  let genreBonus = 0;
  if (profile.genreAffinities.length > 0) {
    let genreNames: string[] = [];
    try {
      genreNames = JSON.parse(seed.genres) as string[];
    } catch {
      genreNames = [];
    }
    if (genreNames.length > 0) {
      const max = Math.max(...profile.genreAffinities.map((a) => a.avgScore));
      const min = Math.min(...profile.genreAffinities.map((a) => a.avgScore));
      const range = max - min || 1;
      const affinityMap = new Map(
        profile.genreAffinities.map((a) => [a.genre, (a.avgScore - min) / range])
      );
      const scores = genreNames.map((g) => affinityMap.get(g) ?? 0);
      genreBonus = scores.reduce((sum, s) => sum + s, 0) / genreNames.length;
    }
  }
  return Math.min(1, eloScore * 0.7 + genreBonus * 0.3);
}

function buildInstance(
  deps: DiscoveryDeps,
  seed: WatchedSeedMovie,
  profile: PreferenceProfile
): ShelfInstance {
  return {
    shelfId: `because-you-watched:${seed.id}`,
    title: `Because you watched ${seed.title}`,
    subtitle: 'Movies similar to a recent watch',
    emoji: '🎬',
    score: computeSeedScore(seed, profile),
    seedMovieId: seed.id,
    query: (opts) =>
      scoredTmdbShelfQuery({
        deps,
        profile,
        opts,
        fetch: (page) => deps.tmdbClient.getMovieRecommendations(seed.tmdbId, page),
      }),
  };
}

export const becauseYouWatchedShelf: ShelfDefinition = {
  id: 'because-you-watched',
  template: true,
  category: 'seed',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const maxSeeds = getMaxBecauseYouWatchedSeeds();
    const seeds = discoveryService.getWatchedSeeds(deps.db);
    const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const recent = seeds.filter((s) => s.watchedAt >= cutoff);
    const older = seeds.filter((s) => s.watchedAt < cutoff);

    const recentCount = Math.round(maxSeeds * RECENT_RATIO);
    const olderCount = maxSeeds - recentCount;
    const selected = [
      ...shuffle(recent).slice(0, recentCount),
      ...shuffle(older).slice(0, olderCount),
    ].slice(0, maxSeeds);

    return selected.map((seed) => buildInstance(deps, seed, profile));
  },
};
