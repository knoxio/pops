import { eq } from 'drizzle-orm';

import { movies, rotationCandidates, settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getMediaDrizzle } from '../../../db/media-db-handle.js';
import { trpcError } from '../../../shared/trpc-error.js';
import { getRadarrClient } from '../arr/service.js';
import { addMovie as addMovieToLibrary } from '../library/service.js';
import { getImageCache, getTmdbClient } from '../tmdb/index.js';

interface RadarrConfig {
  qualityProfileId: number;
  rootFolderPath: string;
}

function loadCandidate(candidateId: number): typeof rotationCandidates.$inferSelect {
  const db = getDrizzle();
  const candidate = db
    .select()
    .from(rotationCandidates)
    .where(eq(rotationCandidates.id, candidateId))
    .get();
  if (!candidate) {
    throw trpcError('NOT_FOUND', 'media.rotation.candidateNotFound');
  }
  if (candidate.status !== 'pending') {
    throw trpcError('BAD_REQUEST', 'media.rotation.candidateAlreadyProcessed', {
      status: candidate.status,
    });
  }
  return candidate;
}

function loadRadarrConfig(): RadarrConfig {
  const db = getDrizzle();
  const qualityProfileId = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'rotation_quality_profile_id'))
    .get()?.value;
  const rootFolderPath = db
    .select()
    .from(settings)
    .where(eq(settings.key, 'rotation_root_folder_path'))
    .get()?.value;
  if (!qualityProfileId || !rootFolderPath) {
    throw trpcError('PRECONDITION_FAILED', 'media.rotation.radarrConfigMissing');
  }
  return { qualityProfileId: Number(qualityProfileId), rootFolderPath };
}

export async function downloadCandidateImpl(
  candidateId: number
): Promise<{ success: boolean; alreadyInRadarr: boolean }> {
  const db = getDrizzle();
  const candidate = loadCandidate(candidateId);

  const client = getRadarrClient();
  if (!client) {
    throw trpcError('PRECONDITION_FAILED', 'media.rotation.radarrNotConfigured');
  }

  const config = loadRadarrConfig();
  const check = await client.checkMovie(candidate.tmdbId);
  if (check.exists) {
    db.update(rotationCandidates)
      .set({ status: 'added' })
      .where(eq(rotationCandidates.id, candidateId))
      .run();
    return { success: true, alreadyInRadarr: true };
  }

  await client.addMovie({
    tmdbId: candidate.tmdbId,
    title: candidate.title,
    year: candidate.year ?? new Date().getFullYear(),
    qualityProfileId: config.qualityProfileId,
    rootFolderPath: config.rootFolderPath,
  });

  try {
    const tmdbClient = getTmdbClient();
    const imageCache = getImageCache();
    await addMovieToLibrary(candidate.tmdbId, tmdbClient, imageCache);
  } catch (err) {
    console.warn('[rotation] Failed to create library entry for tmdb=%d:', candidate.tmdbId, err);
  }

  db.update(rotationCandidates)
    .set({ status: 'added' })
    .where(eq(rotationCandidates.id, candidateId))
    .run();

  getMediaDrizzle()
    .update(movies)
    .set({ rotationStatus: 'protected' })
    .where(eq(movies.tmdbId, candidate.tmdbId))
    .run();

  return { success: true, alreadyInRadarr: false };
}
