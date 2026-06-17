/**
 * Shared types + pure policy math for the rotation cycle (api-layer).
 *
 * Ported from the monolith `rotation-cycle-types.ts` + the pure helpers of
 * `removal-selection.ts` / `addition-gating.ts`. The `RotationMovieRef` /
 * `RotationFailedMovieRef` shapes are re-exported from the db `rotationLog`
 * service so the cycle result and the persisted log share one definition.
 */
import type { RotationFailedMovieRef, RotationMovieRef } from '../../db/index.js';

export type { RotationFailedMovieRef, RotationMovieRef } from '../../db/index.js';

const BYTES_PER_GB = 1_073_741_824;

export interface RotationCycleResult {
  moviesMarkedLeaving: number;
  moviesRemoved: number;
  moviesAdded: number;
  removalsFailed: number;
  freeSpaceGb: number;
  targetFreeGb: number;
  skippedReason: string | null;
  marked: RotationMovieRef[];
  removed: RotationMovieRef[];
  added: RotationMovieRef[];
  failed: RotationFailedMovieRef[];
}

export function emptyResult(targetFreeGb: number): RotationCycleResult {
  return {
    moviesMarkedLeaving: 0,
    moviesRemoved: 0,
    moviesAdded: 0,
    removalsFailed: 0,
    freeSpaceGb: 0,
    targetFreeGb,
    skippedReason: null,
    marked: [],
    removed: [],
    added: [],
    failed: [],
  };
}

/** Convert a byte size to GB. */
export function bytesToGb(bytes: number): number {
  return bytes / BYTES_PER_GB;
}

/**
 * GB of movies that must be removed:
 * `target_free - current_free - sizeOf(leaving movies)`, clamped to >= 0.
 */
export function calculateRemovalDeficit(
  targetFreeGb: number,
  currentFreeGb: number,
  leavingSizeGb: number
): number {
  return Math.max(0, targetFreeGb - currentFreeGb - leavingSizeGb);
}

/**
 * How many movies may be added without dropping below the target. Returns 0
 * when already below target (or `avgMovieGb <= 0`); otherwise
 * `min(dailyAdditions, floor((free - target) / avgMovieGb))`.
 */
export function getAdditionBudget(
  freeSpaceGb: number,
  targetFreeGb: number,
  avgMovieGb: number,
  dailyAdditions: number
): number {
  if (freeSpaceGb < targetFreeGb) return 0;
  if (avgMovieGb <= 0) return 0;
  const maxBySpace = Math.floor((freeSpaceGb - targetFreeGb) / avgMovieGb);
  return Math.min(dailyAdditions, maxBySpace);
}
