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

interface RadarrConfig {
  qualityProfileId: number;
  rootFolderPath: string;
}

function loadRadarrConfig(): RadarrConfig | null {
  const qualityProfileId = getSetting(SETTINGS_KEYS.qualityProfileId);
  const rootFolderPath = getSetting(SETTINGS_KEYS.rootFolderPath);
  if (!qualityProfileId || !rootFolderPath) return null;
  return { qualityProfileId: Number(qualityProfileId), rootFolderPath };
}

function markCandidate(candidateId: number, status: 'added' | 'skipped'): void {
  const db = getDrizzle();
  db.update(rotationCandidates).set({ status }).where(eq(rotationCandidates.id, candidateId)).run();
}

async function ensureLibraryEntry(tmdbId: number, title: string): Promise<void> {
  try {
    const tmdbClient = getTmdbClient();
    const imageCache = getImageCache();
    await addMovieToLibrary(tmdbId, tmdbClient, imageCache);
  } catch (libErr) {
    const msg = libErr instanceof Error ? libErr.message : String(libErr);
    console.warn(`[Rotation] Library entry creation failed for ${title} (tmdb=${tmdbId}): ${msg}`);
  }
}

interface AddCandidateResult {
  added: boolean;
  ref: AddedMovieRef | null;
}

async function addCandidate(
  candidate: ReturnType<typeof aggregateCandidates>[number],
  client: NonNullable<ReturnType<typeof getRadarrClient>>,
  config: RadarrConfig
): Promise<AddCandidateResult> {
  try {
    const check = await client.checkMovie(candidate.tmdbId);
    if (check.exists) {
      markCandidate(candidate.candidateId, 'skipped');
      return { added: false, ref: null };
    }

    await client.addMovie({
      tmdbId: candidate.tmdbId,
      title: candidate.title,
      year: candidate.year ?? new Date().getFullYear(),
      qualityProfileId: config.qualityProfileId,
      rootFolderPath: config.rootFolderPath,
    });

    await ensureLibraryEntry(candidate.tmdbId, candidate.title);
    markCandidate(candidate.candidateId, 'added');
    console.warn(
      `[Rotation] Added: ${candidate.title} (tmdb=${candidate.tmdbId}, weight=${candidate.weight.toFixed(2)})`
    );
    return { added: true, ref: { tmdbId: candidate.tmdbId, title: candidate.title } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[Rotation] Failed to add candidate ${candidate.title} (tmdb=${candidate.tmdbId}):`,
      message
    );
    markCandidate(candidate.candidateId, 'skipped');
    return { added: false, ref: null };
  }
}

/**
 * Select and add up to `budget` movies from the candidate queue using the
 * weighted selection policy (PRD-071 US-05).
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

  const config = loadRadarrConfig();
  if (!config) {
    return {
      added: 0,
      addedMovies: [],
      skippedReason: 'rotation_quality_profile_id or rotation_root_folder_path not configured',
    };
  }

  const selected = aggregateCandidates(budget);
  if (selected.length === 0) {
    return { added: 0, addedMovies: [], skippedReason: 'no pending candidates in queue' };
  }

  let added = 0;
  const addedMovies: AddedMovieRef[] = [];
  for (const candidate of selected) {
    const result = await addCandidate(candidate, client, config);
    if (result.added && result.ref) {
      added++;
      addedMovies.push(result.ref);
    }
  }

  return { added, addedMovies, skippedReason: null };
}
