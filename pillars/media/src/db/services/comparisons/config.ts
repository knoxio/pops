/**
 * Tuning knobs for the comparisons ranking engine.
 *
 * The monolith read these from `core/settings` (`settingsService.getSetting`).
 * The pillar must not depend on `core/settings` or `apps/pops-api`, so each
 * value is read from `process.env` with the SAME default the settings table
 * shipped — mirroring the pattern the tmdb/thetvdb clients use for their
 * keys. Centralised here so every reader resolves the same value.
 */
import { getEnvFloat, getEnvInt } from '../../../api/clients/env.js';

/** ELO K-factor for score updates. Larger = bigger swings per comparison. */
export function getEloK(): number {
  return getEnvInt('MEDIA_COMPARISONS_ELO_K', 32);
}

/** Baseline ELO score every media item starts at on a dimension. */
export function getDefaultScore(): number {
  return getEnvInt('MEDIA_COMPARISONS_DEFAULT_SCORE', 1500);
}

/** Maximum number of movies surfaced in a single tier-list placement round. */
export function getMaxTierListMovies(): number {
  return getEnvInt('MEDIA_COMPARISONS_MAX_TIER_LIST_MOVIES', 8);
}

/**
 * Minimum staleness (1.0 = fresh) a movie must retain to remain eligible for
 * tier-list selection. A fractional knob, so it reads as a float.
 */
export function getStalenessThreshold(): number {
  return getEnvFloat('MEDIA_COMPARISONS_STALENESS_THRESHOLD', 0.3);
}

/** Default page size for paginated comparison/ranking lists. */
export function getDefaultLimit(): number {
  return getEnvInt('MEDIA_COMPARISONS_DEFAULT_LIMIT', 50);
}
