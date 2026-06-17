/**
 * Discovery session + shelf caps.
 *
 * The monolith read these from `core/settings`; the pillar must not depend on
 * `core/settings` or `apps/pops-api`, so each value is read from `process.env`
 * with the SAME default the settings table shipped (mirroring the comparisons /
 * tmdb precedent). The env keys mirror the
 * `contract/settings/discovery-manifest.ts` field keys, upper-snake-cased.
 * Centralised here so every reader resolves the same value.
 */
import { getEnvInt } from '../../clients/env.js';

/** Minimum number of shelves a discover session aims to surface. */
export function getSessionTargetMin(): number {
  return getEnvInt('MEDIA_DISCOVERY_SESSION_TARGET_MIN', 10);
}

/** Maximum number of shelves a discover session may surface. */
export function getSessionTargetMax(): number {
  return getEnvInt('MEDIA_DISCOVERY_SESSION_TARGET_MAX', 15);
}

/** Max seed-category shelves (because-you-watched, credits, dimension) per session. */
export function getMaxSeedShelves(): number {
  return getEnvInt('MEDIA_DISCOVERY_MAX_SEED_SHELVES', 3);
}

/** Max genre shelves (best-in-genre + genre-crossover) per session. */
export function getMaxGenreShelves(): number {
  return getEnvInt('MEDIA_DISCOVERY_MAX_GENRE_SHELVES', 2);
}

/** Max time-triggered context collections active at once. */
export function getMaxActiveCollections(): number {
  return getEnvInt('MEDIA_DISCOVERY_MAX_ACTIVE_COLLECTIONS', 2);
}

/** Max "because you watched" seeds generated per session. */
export function getMaxBecauseYouWatchedSeeds(): number {
  return getEnvInt('MEDIA_DISCOVERY_MAX_BECAUSE_YOU_WATCHED_SEEDS', 10);
}

/** Max credits (director/actor) seeds generated per session. */
export function getMaxCreditsSeeds(): number {
  return getEnvInt('MEDIA_DISCOVERY_MAX_CREDITS_SEEDS', 10);
}

/** Max best-in-genre shelves generated from the top genre affinities. */
export function getMaxBestInGenre(): number {
  return getEnvInt('MEDIA_DISCOVERY_MAX_BEST_IN_GENRE', 5);
}

/** Max genre-crossover pairs generated from the top genre affinities. */
export function getMaxCrossoverPairs(): number {
  return getEnvInt('MEDIA_DISCOVERY_MAX_CROSSOVER_PAIRS', 6);
}
