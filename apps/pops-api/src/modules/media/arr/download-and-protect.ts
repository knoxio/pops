import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import { movies, settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { addMovie as addMovieToLibrary } from '../library/service.js';
import { getImageCache, getTmdbClient } from '../tmdb/index.js';
import * as arrService from './service.js';

import type { RadarrClient } from './radarr-client.js';

export interface DownloadAndProtectInput {
  tmdbId: number;
  title: string;
  year: number;
}

export interface DownloadAndProtectResult {
  alreadyInRadarr: boolean;
}

interface RotationDefaults {
  qualityProfileId: number;
  rootFolderPath: string;
}

function loadRotationDefaults(): RotationDefaults {
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
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Radarr quality profile or root folder not configured',
    });
  }
  return { qualityProfileId: Number(qualityProfileId), rootFolderPath };
}

async function ensureMovieInRadarr(
  client: RadarrClient,
  input: DownloadAndProtectInput,
  defaults: RotationDefaults
): Promise<boolean> {
  const check = await client.checkMovie(input.tmdbId);
  if (!check.exists) {
    await client.addMovie({
      tmdbId: input.tmdbId,
      title: input.title,
      year: input.year,
      qualityProfileId: defaults.qualityProfileId,
      rootFolderPath: defaults.rootFolderPath,
    });
  }
  arrService.clearMovieStatusCache(input.tmdbId);
  return check.exists;
}

async function ensureLibraryEntry(tmdbId: number): Promise<void> {
  try {
    const tmdbClient = getTmdbClient();
    const imageCache = getImageCache();
    await addMovieToLibrary(tmdbId, tmdbClient, imageCache);
  } catch (err) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `Failed to create library entry: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

function markMovieProtected(tmdbId: number): void {
  const db = getDrizzle();
  const updateResult = db
    .update(movies)
    .set({ rotationStatus: 'protected' })
    .where(eq(movies.tmdbId, tmdbId))
    .run();
  if (updateResult.changes === 0) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `No library entry found for tmdbId ${tmdbId}`,
    });
  }
}

/**
 * Add a movie to Radarr (if not present), create a POPS library entry,
 * and mark the movie as rotation_status = 'protected'.
 */
export async function downloadAndProtectMovie(
  input: DownloadAndProtectInput
): Promise<DownloadAndProtectResult> {
  const client = arrService.getRadarrClient();
  if (!client) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Radarr not configured' });
  }
  const defaults = loadRotationDefaults();
  const alreadyInRadarr = await ensureMovieInRadarr(client, input, defaults);
  await ensureLibraryEntry(input.tmdbId);
  markMovieProtected(input.tmdbId);
  return { alreadyInRadarr };
}
