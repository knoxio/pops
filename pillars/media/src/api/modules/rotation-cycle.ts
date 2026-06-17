/**
 * The rotation cycle orchestration (api-layer).
 *
 * One cycle: batch-sync sources → sweep expired `leaving` movies (delete from
 * Radarr) → measure free disk → mark the oldest eligible movies `leaving` to
 * cover the deficit → re-measure disk → add up to the daily cap of candidates
 * when space allows. Returns a {@link RotationCycleResult} the scheduler writes
 * to the rotation log. Ported from the monolith `rotation-cycle.ts`; repointed
 * onto the env-only Radarr client + the pillar's `rotation_settings` kv table.
 */
import { type MediaDb, type MovieSizeMap, rotationRemovalQueries } from '../../db/index.js';
import { getRadarrClient, type RadarrClient } from '../clients/arr/index.js';
import { addMoviesFromQueue } from './rotation-addition.js';
import { getRotationCyclePolicy } from './rotation-cycle-policy.js';
import {
  calculateRemovalDeficit,
  emptyResult,
  getAdditionBudget,
  type RotationCycleResult,
  type RotationMovieRef,
} from './rotation-cycle-types.js';
import {
  getDownloadingTmdbIds,
  getRadarrDiskSpace,
  getRadarrMovieSizes,
  processExpiredMovies,
} from './rotation-removal.js';
import { syncAllSources } from './rotation-sync-all.js';

interface MarkLeavingArgs {
  freeSpaceGb: number;
  targetFreeGb: number;
  leavingDays: number;
  movieSizes: MovieSizeMap;
}

async function markLeaving(
  db: MediaDb,
  client: RadarrClient,
  args: MarkLeavingArgs
): Promise<RotationMovieRef[]> {
  const { freeSpaceGb, targetFreeGb, leavingDays, movieSizes } = args;
  const leavingSizeGb = rotationRemovalQueries.getLeavingMovieSizeGb(db, movieSizes);
  const deficit = calculateRemovalDeficit(targetFreeGb, freeSpaceGb, leavingSizeGb);
  if (deficit <= 0) return [];

  const downloadingIds = await getDownloadingTmdbIds(client);
  const eligible = rotationRemovalQueries.getEligibleForRemoval(db, movieSizes, downloadingIds);

  const toMark: typeof eligible = [];
  let accumulated = 0;
  for (const movie of eligible) {
    const sizeGb = movieSizes.get(movie.tmdbId) ?? 0;
    if (sizeGb <= 0) continue;
    toMark.push(movie);
    accumulated += sizeGb;
    if (accumulated >= deficit) break;
  }
  if (toMark.length === 0) return [];

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + leavingDays);
  rotationRemovalQueries.markMoviesAsLeaving(
    db,
    toMark.map((m) => m.id),
    expiresAt.toISOString()
  );
  return toMark.map((m) => ({ tmdbId: m.tmdbId, title: m.title }));
}

async function reCheckFreeSpace(client: RadarrClient, fallbackGb: number): Promise<number> {
  try {
    return await getRadarrDiskSpace(client);
  } catch {
    return fallbackGb;
  }
}

/**
 * Run a single rotation cycle. A missing Radarr client (after the expiry
 * sweep) short-circuits to a skipped result that still reflects the removals.
 */
export async function executeRotationCycle(db: MediaDb): Promise<RotationCycleResult> {
  const policy = getRotationCyclePolicy(db);
  const { targetFreeGb, leavingDays } = policy;

  await syncAllSources(db);

  const client = getRadarrClient();
  if (!client) {
    return { ...emptyResult(targetFreeGb), skippedReason: 'Radarr not configured' };
  }

  const expired = await processExpiredMovies(db, client);

  let freeSpaceGb: number;
  try {
    freeSpaceGb = await getRadarrDiskSpace(client);
  } catch {
    return {
      ...emptyResult(targetFreeGb),
      moviesRemoved: expired.removed.length,
      removalsFailed: expired.failed.length,
      removed: expired.removed,
      failed: expired.failed,
      skippedReason: 'Radarr unavailable — cannot measure disk space',
    };
  }

  const movieSizes = await getRadarrMovieSizes(client);
  const marked = await markLeaving(db, client, {
    freeSpaceGb,
    targetFreeGb,
    leavingDays,
    movieSizes,
  });

  const postFreeSpaceGb = await reCheckFreeSpace(client, freeSpaceGb);
  const budget = getAdditionBudget(
    postFreeSpaceGb,
    targetFreeGb,
    policy.avgMovieGb,
    policy.dailyAdditions
  );
  const additions = await addMoviesFromQueue(db, budget);

  return {
    ...emptyResult(targetFreeGb),
    moviesMarkedLeaving: marked.length,
    moviesRemoved: expired.removed.length,
    moviesAdded: additions.added,
    removalsFailed: expired.failed.length,
    freeSpaceGb,
    marked,
    removed: expired.removed,
    added: additions.addedMovies,
    failed: expired.failed,
  };
}
