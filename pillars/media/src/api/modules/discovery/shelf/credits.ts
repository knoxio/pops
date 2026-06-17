/**
 * "More from {Director}" + "More from {Actor}" shelves.
 *
 * Both seed from above-median-ELO library movies. Credits are fetched +
 * cached per movie; the director shelf queries `/discover/movie?with_crew`,
 * the actor shelf `?with_cast` (one instance per lead-cast slot).
 *
 * Ported from the monolith `shelf/credits-shelves.ts`.
 */
import { discoveryService, type PreferenceProfile } from '../../../../db/index.js';
import { type EloSeedMovie } from '../../../../db/services/discovery/index.js';
import { getMaxCreditsSeeds } from '../config.js';
import {
  LEAD_CAST_COUNT,
  extractDirector,
  extractLeadCast,
  getCachedCredits,
  peekCachedCredits,
} from './credits-cache.js';
import { scoredTmdbShelfQuery } from './shelf-query.js';

import type { DiscoveryDeps } from '../deps.js';
import type { ShelfDefinition, ShelfGenerateArgs, ShelfInstance } from './types.js';

/** Above-median ELO seeds, descending, capped at the configured max. */
function selectSeedMovies(seeds: EloSeedMovie[], max: number): EloSeedMovie[] {
  if (seeds.length === 0) return [];
  const withScores = seeds.filter((r) => r.avgEloScore != null);
  if (withScores.length === 0) return seeds.slice(0, max);

  const sorted = [...withScores].toSorted((a, b) => (a.avgEloScore ?? 0) - (b.avgEloScore ?? 0));
  const median = sorted[Math.floor(sorted.length / 2)]?.avgEloScore ?? 0;
  return withScores
    .filter((r) => (r.avgEloScore ?? 0) >= median)
    .toSorted((a, b) => (b.avgEloScore ?? 0) - (a.avgEloScore ?? 0))
    .slice(0, max);
}

function computeSeedScore(avgEloScore: number | null): number {
  if (avgEloScore == null) return 0.5;
  return Math.min(1, avgEloScore / 2000);
}

function buildDirectorInstance(
  deps: DiscoveryDeps,
  seed: EloSeedMovie,
  profile: PreferenceProfile
): ShelfInstance {
  const cached = peekCachedCredits(seed.tmdbId);
  const director = cached ? extractDirector(cached) : null;
  return {
    shelfId: `more-from-director:${seed.id}`,
    title: director ? `More from ${director.name}` : `More from the director of ${seed.title}`,
    subtitle: director ? `Films directed by ${director.name}` : undefined,
    emoji: '🎬',
    score: computeSeedScore(seed.avgEloScore),
    seedMovieId: seed.id,
    query: async (opts) => {
      const credits = await getCachedCredits(deps.tmdbClient, seed.tmdbId);
      const dir = extractDirector(credits);
      if (!dir) return [];
      return scoredTmdbShelfQuery({
        deps,
        profile,
        opts,
        fetch: (page) => deps.tmdbClient.discoverMoviesByCrew(dir.id, page),
      });
    },
  };
}

function buildActorInstance(
  deps: DiscoveryDeps,
  seed: EloSeedMovie,
  actorIndex: number,
  profile: PreferenceProfile
): ShelfInstance {
  const cached = peekCachedCredits(seed.tmdbId);
  const actor = cached ? (extractLeadCast(cached)[actorIndex] ?? null) : null;
  return {
    shelfId: `more-from-actor:${seed.id}:${actorIndex}`,
    title: actor ? `More from ${actor.name}` : `More from cast of ${seed.title}`,
    subtitle: actor ? `Films featuring ${actor.name}` : undefined,
    emoji: '🎭',
    score: computeSeedScore(seed.avgEloScore),
    seedMovieId: seed.id,
    query: async (opts) => {
      const credits = await getCachedCredits(deps.tmdbClient, seed.tmdbId);
      const act = extractLeadCast(credits)[actorIndex];
      if (!act) return [];
      return scoredTmdbShelfQuery({
        deps,
        profile,
        opts,
        fetch: (page) => deps.tmdbClient.discoverMoviesByCast(act.id, page),
      });
    },
  };
}

export const moreFromDirectorShelf: ShelfDefinition = {
  id: 'more-from-director',
  template: true,
  category: 'seed',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const seeds = selectSeedMovies(
      discoveryService.getEloSeedMovies(deps.db),
      getMaxCreditsSeeds()
    );
    return seeds.map((seed) => buildDirectorInstance(deps, seed, profile));
  },
};

export const moreFromActorShelf: ShelfDefinition = {
  id: 'more-from-actor',
  template: true,
  category: 'seed',
  generate({ deps, profile }: ShelfGenerateArgs): ShelfInstance[] {
    const seeds = selectSeedMovies(
      discoveryService.getEloSeedMovies(deps.db),
      getMaxCreditsSeeds()
    );
    const instances: ShelfInstance[] = [];
    for (const seed of seeds) {
      for (let i = 0; i < LEAD_CAST_COUNT; i++) {
        instances.push(buildActorInstance(deps, seed, i, profile));
      }
    }
    return instances;
  },
};
