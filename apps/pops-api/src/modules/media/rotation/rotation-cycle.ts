import {
  addMoviesFromQueue,
  getAdditionBudget,
  getAvgMovieGb,
  getDailyAdditions,
} from './addition-gating.js';
import {
  calculateRemovalDeficit,
  getDownloadingTmdbIds,
  getEligibleForRemoval,
  getLeavingMovieSizeGb,
  getRadarrDiskSpace,
  getRadarrMovieSizes,
  markMoviesAsLeaving,
  processExpiredMovies,
  selectMoviesForRemoval,
} from './removal-selection.js';
import {
  emptyResult,
  type RotationCycleResult,
  type RotationFailedMovieRef,
  type RotationMovieRef,
} from './rotation-cycle-types.js';
import { syncAllSources } from './sync-source.js';

interface ExpiredOutcome {
  moviesRemoved: number;
  removalsFailed: number;
  removed: RotationMovieRef[];
  failed: RotationFailedMovieRef[];
}

async function processExpired(): Promise<ExpiredOutcome> {
  const results = await processExpiredMovies();
  const removed: RotationMovieRef[] = results
    .filter((r) => r.success)
    .map((r) => ({ tmdbId: r.tmdbId, title: r.title }));
  const failed: RotationFailedMovieRef[] = results
    .filter((r) => !r.success)
    .map((r) => ({ tmdbId: r.tmdbId, title: r.title, error: r.error }));
  return {
    moviesRemoved: removed.length,
    removalsFailed: failed.length,
    removed,
    failed,
  };
}

interface MarkLeavingArgs {
  freeSpaceGb: number;
  targetFreeGb: number;
  leavingDays: number;
}

interface MarkLeavingOutcome {
  moviesMarkedLeaving: number;
  marked: RotationMovieRef[];
}

async function markLeaving(args: MarkLeavingArgs): Promise<MarkLeavingOutcome> {
  const { freeSpaceGb, targetFreeGb, leavingDays } = args;
  const movieSizes = await getRadarrMovieSizes();
  const leavingSizeGb = getLeavingMovieSizeGb(movieSizes);
  const deficit = calculateRemovalDeficit(targetFreeGb, freeSpaceGb, leavingSizeGb);
  if (deficit <= 0) return { moviesMarkedLeaving: 0, marked: [] };

  const downloadingIds = await getDownloadingTmdbIds();
  const eligible = getEligibleForRemoval(movieSizes, downloadingIds);
  const selection = selectMoviesForRemoval(eligible, movieSizes, deficit);
  if (selection.moviesToMark.length === 0) {
    return { moviesMarkedLeaving: 0, marked: [] };
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + leavingDays);
  markMoviesAsLeaving(
    selection.moviesToMark.map((m) => m.id),
    expiresAt.toISOString()
  );
  return {
    moviesMarkedLeaving: selection.moviesToMark.length,
    marked: selection.moviesToMark.map((m) => ({ tmdbId: m.tmdbId, title: m.title })),
  };
}

async function reCheckFreeSpace(fallbackGb: number): Promise<number> {
  try {
    return await getRadarrDiskSpace();
  } catch {
    return fallbackGb;
  }
}

async function performAdditions(
  freeSpaceGb: number,
  targetFreeGb: number
): Promise<{ moviesAdded: number; added: RotationMovieRef[] }> {
  const budget = getAdditionBudget(freeSpaceGb, targetFreeGb, getAvgMovieGb(), getDailyAdditions());
  const additionResult = await addMoviesFromQueue(budget);
  if (budget === 0) {
    console.warn('[Rotation] Additions skipped — below target free space');
  }
  return { moviesAdded: additionResult.added, added: additionResult.addedMovies };
}

export interface RunCycleArgs {
  targetFreeGb: number;
  leavingDays: number;
}

export async function executeRotationCycle(args: RunCycleArgs): Promise<RotationCycleResult> {
  const { targetFreeGb, leavingDays } = args;

  await syncAllSources();
  const expired = await processExpired();

  let freeSpaceGb: number;
  try {
    freeSpaceGb = await getRadarrDiskSpace();
  } catch {
    return {
      ...emptyResult(targetFreeGb),
      moviesRemoved: expired.moviesRemoved,
      removalsFailed: expired.removalsFailed,
      removed: expired.removed,
      failed: expired.failed,
      skippedReason: 'Radarr unavailable — cannot measure disk space',
    };
  }

  const leaving = await markLeaving({ freeSpaceGb, targetFreeGb, leavingDays });
  const postFreeSpaceGb = await reCheckFreeSpace(freeSpaceGb);
  const additions = await performAdditions(postFreeSpaceGb, targetFreeGb);

  return {
    ...emptyResult(targetFreeGb),
    moviesMarkedLeaving: leaving.moviesMarkedLeaving,
    moviesRemoved: expired.moviesRemoved,
    moviesAdded: additions.moviesAdded,
    removalsFailed: expired.removalsFailed,
    freeSpaceGb,
    marked: leaving.marked,
    removed: expired.removed,
    added: additions.added,
    failed: expired.failed,
  };
}
