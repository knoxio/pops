/**
 * Radarr-backed addition phase for the rotation cycle (api-layer).
 *
 * Selects up to `budget` pending candidates via the weighted selection policy
 * and adds each to Radarr (skipping any already present), best-effort enriches
 * the POPS library entry, and marks the candidate `added` / `skipped`. Ported
 * from the monolith `addition-gating.ts`; gating math + candidate selection are
 * pure/db-layer concerns, so this file only owns the Radarr + TMDB calls.
 */
import { eq } from 'drizzle-orm';

import {
  type MediaDb,
  rotationCandidates,
  rotationSelectionService,
  type SelectedCandidate,
} from '../../db/index.js';
import { getRadarrClient, getRotationDefaults, type RadarrClient } from '../clients/arr/index.js';
import { getImageCache, getTmdbClient } from '../clients/tmdb/index.js';
import { addMovie } from './library-mutations.js';

import type { RotationMovieRef } from './rotation-cycle-types.js';

export interface AdditionResult {
  added: number;
  addedMovies: RotationMovieRef[];
  skippedReason: string | null;
}

function markCandidate(db: MediaDb, candidateId: number, status: 'added' | 'skipped'): void {
  db.update(rotationCandidates).set({ status }).where(eq(rotationCandidates.id, candidateId)).run();
}

async function enrichLibrary(db: MediaDb, tmdbId: number, title: string): Promise<void> {
  try {
    await addMovie({ db, tmdbClient: getTmdbClient(), imageCache: getImageCache() }, tmdbId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[rotation] Library entry creation failed for ${title} (tmdb=${tmdbId}): ${msg}`);
  }
}

async function addCandidate(
  db: MediaDb,
  candidate: SelectedCandidate,
  client: RadarrClient,
  defaults: { qualityProfileId: number; rootFolderPath: string }
): Promise<RotationMovieRef | null> {
  try {
    const check = await client.checkMovie(candidate.tmdbId);
    if (check.exists) {
      markCandidate(db, candidate.candidateId, 'skipped');
      return null;
    }

    await client.addMovie({
      tmdbId: candidate.tmdbId,
      title: candidate.title,
      year: candidate.year ?? new Date().getFullYear(),
      qualityProfileId: defaults.qualityProfileId,
      rootFolderPath: defaults.rootFolderPath,
    });

    await enrichLibrary(db, candidate.tmdbId, candidate.title);
    markCandidate(db, candidate.candidateId, 'added');
    return { tmdbId: candidate.tmdbId, title: candidate.title };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[rotation] Failed to add candidate ${candidate.title}: ${msg}`);
    markCandidate(db, candidate.candidateId, 'skipped');
    return null;
  }
}

/**
 * Add up to `budget` weighted-sampled candidates to Radarr. Returns the count
 * + per-movie refs of what was actually added, plus a `skippedReason` when the
 * whole phase no-ops (budget 0, Radarr/defaults unconfigured, empty queue).
 */
export async function addMoviesFromQueue(db: MediaDb, budget: number): Promise<AdditionResult> {
  if (budget <= 0) {
    return {
      added: 0,
      addedMovies: [],
      skippedReason: 'additions skipped — below target free space',
    };
  }

  const client = getRadarrClient();
  if (!client) {
    return {
      added: 0,
      addedMovies: [],
      skippedReason: 'Radarr not configured — cannot add movies',
    };
  }

  const defaults = getRotationDefaults();
  if (!defaults) {
    return {
      added: 0,
      addedMovies: [],
      skippedReason: 'RADARR_QUALITY_PROFILE_ID or RADARR_ROOT_FOLDER_PATH not configured',
    };
  }

  const selected = rotationSelectionService.aggregateCandidates(db, budget);
  if (selected.length === 0) {
    return { added: 0, addedMovies: [], skippedReason: 'no pending candidates in queue' };
  }

  const addedMovies: RotationMovieRef[] = [];
  for (const candidate of selected) {
    const ref = await addCandidate(db, candidate, client, defaults);
    if (ref) addedMovies.push(ref);
  }

  return { added: addedMovies.length, addedMovies, skippedReason: null };
}
