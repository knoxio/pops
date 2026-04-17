import { eq } from 'drizzle-orm';

/**
 * Addition gating service — gates movie additions on available disk space.
 *
 * After removals and leaving marks, the cycle re-checks free space. Additions
 * from the candidate queue only proceed when there is enough room.
 *
 * PRD-070 US-05
 */
import { rotationCandidates, settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getRadarrClient } from '../arr/service.js';
import { addMovie as addMovieToLibrary } from '../library/service.js';
import { getImageCache, getTmdbClient } from '../tmdb/index.js';
import { aggregateCandidates } from './selection-policy.js';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const SETTINGS_KEYS = {
  dailyAdditions: 'rotation_daily_additions',
  avgMovieGb: 'rotation_avg_movie_gb',
  qualityProfileId: 'rotation_quality_profile_id',
  rootFolderPath: 'rotation_root_folder_path',
} as const;

const DEFAULT_DAILY_ADDITIONS = 2;
const DEFAULT_AVG_MOVIE_GB = 15;

function getSetting(key: string): string | null {
  const db = getDrizzle();
  const record = db.select().from(settings).where(eq(settings.key, key)).get();
  return record?.value ?? null;
}

export function getDailyAdditions(): number {
  const val = getSetting(SETTINGS_KEYS.dailyAdditions);
  return val ? Number(val) : DEFAULT_DAILY_ADDITIONS;
}

export function getAvgMovieGb(): number {
  const val = getSetting(SETTINGS_KEYS.avgMovieGb);
  return val ? Number(val) : DEFAULT_AVG_MOVIE_GB;
}

// ---------------------------------------------------------------------------
// Budget calculation (pure)
// ---------------------------------------------------------------------------

/**
 * Calculate how many movies can be added without dropping below the target.
 *
 * Returns 0 if free space is already below target.
 * Otherwise returns min(dailyAdditions, floor((freeSpace - target) / avgMovieGb)).
 */
export function getAdditionBudget(
  freeSpaceGb: number,
  targetFreeGb: number,
  avgMovieGb: number,
  dailyAdditions: number
): number {
  if (freeSpaceGb < targetFreeGb) return 0;
  if (avgMovieGb <= 0) return 0;
  const headroom = freeSpaceGb - targetFreeGb;
  const maxBySpace = Math.floor(headroom / avgMovieGb);
  return Math.min(dailyAdditions, maxBySpace);
}

// ---------------------------------------------------------------------------
// Queue processing
// ---------------------------------------------------------------------------

/** A movie that was successfully added during the rotation cycle. */
export interface AddedMovieRef {
  tmdbId: number;
  title: string;
}

export interface AdditionResult {
  added: number;
  addedMovies: AddedMovieRef[];
  skippedReason: string | null;
}

/**
 * Select and add up to `budget` movies from the candidate queue using the
 * weighted selection policy (PRD-071 US-05). For each selected candidate:
 * 1. Add to Radarr with searchForMovie: true
 * 2. Create a POPS library entry via TMDB metadata
 * 3. Update candidate status to 'added'
 *
 * On failure, marks the candidate as 'skipped' and continues to fill the
 * requested count.
 */
export async function addMoviesFromQueue(budget: number): Promise<AdditionResult> {
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

  const qualityProfileId = getSetting(SETTINGS_KEYS.qualityProfileId);
  const rootFolderPath = getSetting(SETTINGS_KEYS.rootFolderPath);

  if (!qualityProfileId || !rootFolderPath) {
    return {
      added: 0,
      addedMovies: [],
      skippedReason: 'rotation_quality_profile_id or rotation_root_folder_path not configured',
    };
  }

  const db = getDrizzle();

  // Use weighted selection policy instead of simple ordering
  const selected = aggregateCandidates(budget);

  if (selected.length === 0) {
    return { added: 0, addedMovies: [], skippedReason: 'no pending candidates in queue' };
  }

  let added = 0;
  const addedMovies: AddedMovieRef[] = [];
  for (const candidate of selected) {
    try {
      // Check if already in Radarr
      const check = await client.checkMovie(candidate.tmdbId);
      if (check.exists) {
        db.update(rotationCandidates)
          .set({ status: 'skipped' })
          .where(eq(rotationCandidates.id, candidate.candidateId))
          .run();
        continue;
      }

      // Add to Radarr
      await client.addMovie({
        tmdbId: candidate.tmdbId,
        title: candidate.title,
        year: candidate.year ?? new Date().getFullYear(),
        qualityProfileId: Number(qualityProfileId),
        rootFolderPath,
      });

      // Create POPS library entry (idempotent — returns existing if already present)
      try {
        const tmdbClient = getTmdbClient();
        const imageCache = getImageCache();
        await addMovieToLibrary(candidate.tmdbId, tmdbClient, imageCache);
      } catch (libErr) {
        // Log but don't fail the addition — the movie is in Radarr
        const msg = libErr instanceof Error ? libErr.message : String(libErr);
        console.warn(
          `[Rotation] Library entry creation failed for ${candidate.title} (tmdb=${candidate.tmdbId}): ${msg}`
        );
      }

      db.update(rotationCandidates)
        .set({ status: 'added' })
        .where(eq(rotationCandidates.id, candidate.candidateId))
        .run();
      added++;
      addedMovies.push({ tmdbId: candidate.tmdbId, title: candidate.title });

      console.warn(
        `[Rotation] Added: ${candidate.title} (tmdb=${candidate.tmdbId}, weight=${candidate.weight.toFixed(2)})`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[Rotation] Failed to add candidate ${candidate.title} (tmdb=${candidate.tmdbId}):`,
        message
      );
      db.update(rotationCandidates)
        .set({ status: 'skipped' })
        .where(eq(rotationCandidates.id, candidate.candidateId))
        .run();
    }
  }

  return { added, addedMovies, skippedReason: null };
}
