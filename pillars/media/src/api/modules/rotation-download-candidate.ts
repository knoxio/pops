/**
 * Download-candidate orchestration (api-layer).
 *
 * Adds a rotation candidate to Radarr, creates/enriches the POPS library
 * entry, marks the candidate `added`, and flips the library row to
 * `protected`. Calls the upstream Radarr + TMDB clients, so it's an api-layer
 * concern, NOT a db service. Ported from the monolith `download-candidate.ts`,
 * repointed onto the pillar's env-only Radarr defaults (parity with the arr
 * `downloadAndProtect` path) and the pillar `(db, …)` services.
 *
 * The `rotationStatus='protected'` write keeps a downloaded movie out of the
 * removal phase — `rotation-removal-queries.getEligibleForRemoval` skips
 * unexpired `protected` rows.
 */
import {
  type MediaDb,
  MovieConflictError,
  type MovieRow,
  moviesService,
  rotationCandidateSyncService,
} from '../../db/index.js';
import { getRadarrClient, getRotationDefaults } from '../clients/arr/index.js';
import { getImageCache, getTmdbClient } from '../clients/tmdb/index.js';
import { ConflictError } from '../shared/errors.js';
import { addMovie } from './library-mutations.js';

import type { RotationCandidateRow } from '../../db/index.js';

export interface DownloadCandidateResult {
  success: boolean;
  alreadyInRadarr: boolean;
}

/**
 * Best-effort library enrichment: pull full TMDB detail + images. A failure
 * here must not abort the download (the Radarr add already succeeded), so it's
 * logged and swallowed — matching the monolith.
 */
async function enrichLibrary(db: MediaDb, tmdbId: number): Promise<void> {
  try {
    await addMovie({ db, tmdbClient: getTmdbClient(), imageCache: getImageCache() }, tmdbId);
  } catch (err) {
    console.warn(
      `[rotation] Failed to create library entry for tmdb=${tmdbId}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Resolve the library row to protect: the enriched/pre-existing one, else a
 * minimal entry built from the candidate's own data (parity with the arr
 * `downloadAndProtect` fallback). Best-effort enrichment may have failed (e.g.
 * TMDB unconfigured), so the candidate data is the floor.
 */
function ensureLibraryRow(db: MediaDb, candidate: RotationCandidateRow): MovieRow {
  const existing = moviesService.getMovieByTmdbId(db, candidate.tmdbId);
  if (existing) return existing;
  try {
    return moviesService.createMovie(db, {
      tmdbId: candidate.tmdbId,
      title: candidate.title,
      releaseDate: candidate.year ? `${candidate.year}-01-01` : null,
      posterPath: candidate.posterPath,
      voteAverage: candidate.rating,
    });
  } catch (err) {
    if (err instanceof MovieConflictError) {
      const row = moviesService.getMovieByTmdbId(db, candidate.tmdbId);
      if (row) return row;
    }
    throw err;
  }
}

function protectCandidateMovie(db: MediaDb, candidate: RotationCandidateRow): void {
  const movie = ensureLibraryRow(db, candidate);
  moviesService.setRotationStatus(db, movie.id, 'protected');
}

/**
 * Download a pending candidate by id. Throws via the db service when the
 * candidate is missing or already processed, and `ConflictError` (409) when
 * Radarr is unconfigured or its rotation defaults are unset.
 */
export async function downloadCandidate(
  db: MediaDb,
  candidateId: number
): Promise<DownloadCandidateResult> {
  const candidate = rotationCandidateSyncService.getPendingCandidate(db, candidateId);

  const client = getRadarrClient();
  if (!client) throw new ConflictError('Radarr is not configured');

  const defaults = getRotationDefaults();
  if (!defaults) {
    throw new ConflictError(
      'Radarr rotation defaults not configured (RADARR_QUALITY_PROFILE_ID / RADARR_ROOT_FOLDER_PATH)'
    );
  }

  const check = await client.checkMovie(candidate.tmdbId);
  if (check.exists) {
    rotationCandidateSyncService.markCandidateAdded(db, candidateId);
    protectCandidateMovie(db, candidate);
    return { success: true, alreadyInRadarr: true };
  }

  await client.addMovie({
    tmdbId: candidate.tmdbId,
    title: candidate.title,
    year: candidate.year ?? new Date().getFullYear(),
    qualityProfileId: defaults.qualityProfileId,
    rootFolderPath: defaults.rootFolderPath,
  });

  await enrichLibrary(db, candidate.tmdbId);
  rotationCandidateSyncService.markCandidateAdded(db, candidateId);
  protectCandidateMovie(db, candidate);

  return { success: true, alreadyInRadarr: false };
}
