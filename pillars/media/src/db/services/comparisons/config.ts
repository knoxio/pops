/**
 * Tuning knobs for the comparisons ranking engine.
 *
 * Each value is resolved from media's pillar-local `settings` table (the
 * federated `/settings` override the shell UI writes), falling back to the
 * manifest default when no override is stored, and finally to the literal
 * default baked in here if the manifest default is absent or unparseable.
 * Reads happen per call so an edit persisted through `/settings` takes effect
 * at runtime without a restart (GAP-256-B / risk R4).
 */
import { mediaKeyDefaults } from '../../../contract/settings/key-defaults.js';
import * as adapter from '../settings-adapter.js';

import type { MediaDb } from '../internal.js';

const ELO_K = 'media.comparisons.eloK';
const DEFAULT_SCORE = 'media.comparisons.defaultScore';
const MAX_TIER_LIST_MOVIES = 'media.comparisons.maxTierListMovies';
const STALENESS_THRESHOLD = 'media.comparisons.stalenessThreshold';
const DEFAULT_LIMIT = 'media.comparisons.defaultLimit';

/** The stored override (decoded) if present, else the manifest default. */
function effective(db: MediaDb, key: string): string | undefined {
  return adapter.getOrNull(db, key)?.value ?? mediaKeyDefaults.defaults[key];
}

function readInt(db: MediaDb, key: string, fallback: number): number {
  const parsed = Number.parseInt(effective(db, key) ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readFloat(db: MediaDb, key: string, fallback: number): number {
  const parsed = Number.parseFloat(effective(db, key) ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** ELO K-factor for score updates. Larger = bigger swings per comparison. */
export function getEloK(db: MediaDb): number {
  return readInt(db, ELO_K, 32);
}

/** Baseline ELO score every media item starts at on a dimension. */
export function getDefaultScore(db: MediaDb): number {
  return readInt(db, DEFAULT_SCORE, 1500);
}

/** Maximum number of movies surfaced in a single tier-list placement round. */
export function getMaxTierListMovies(db: MediaDb): number {
  return readInt(db, MAX_TIER_LIST_MOVIES, 8);
}

/**
 * Minimum staleness (1.0 = fresh) a movie must retain to remain eligible for
 * tier-list selection. A fractional knob, so it reads as a float.
 */
export function getStalenessThreshold(db: MediaDb): number {
  return readFloat(db, STALENESS_THRESHOLD, 0.3);
}

/** Default page size for paginated comparison/ranking lists. */
export function getDefaultLimit(db: MediaDb): number {
  return readInt(db, DEFAULT_LIMIT, 50);
}
