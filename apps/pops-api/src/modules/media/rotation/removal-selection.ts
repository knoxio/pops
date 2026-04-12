/**
 * Removal selection service — selects movies for removal based on disk space
 * deficit and processes expired leaving movies.
 *
 * PRD-070 US-02
 */
import { eq, and, asc, ne, inArray, sql } from 'drizzle-orm';
import { movies, mediaWatchlist } from '@pops/db-types';
import { getDrizzle } from '../../../db.js';
import { getRadarrClient } from '../arr/service.js';

const BYTES_PER_GB = 1_073_741_824;

/** Map of TMDB ID → size in GB. */
export type MovieSizeMap = Map<number, number>;

// ---------------------------------------------------------------------------
// Radarr helpers
// ---------------------------------------------------------------------------

/** Fetch free space in GB for the root folder's disk from Radarr /diskspace. */
export async function getRadarrDiskSpace(): Promise<number> {
  const client = getRadarrClient();
  if (!client) throw new Error('Radarr not configured');
  const disks = await client.getDiskSpace();
  const disk = disks[0];
  if (!disk) throw new Error('Radarr returned no disk space info');
  // Use the first root folder disk (primary media disk)
  return disk.freeSpace / BYTES_PER_GB;
}

/** Fetch sizeOnDisk for all movies from Radarr, returning a map of TMDB ID → size in GB. */
export async function getRadarrMovieSizes(): Promise<MovieSizeMap> {
  const client = getRadarrClient();
  if (!client) throw new Error('Radarr not configured');
  const radarrMovies = await client.getMovies();
  const map = new Map<number, number>();
  for (const m of radarrMovies) {
    if (m.sizeOnDisk && m.sizeOnDisk > 0) {
      map.set(m.tmdbId, m.sizeOnDisk / BYTES_PER_GB);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Calculation helpers
// ---------------------------------------------------------------------------

/**
 * Calculate how many GB of movies need to be removed.
 *
 * deficit = target_free_gb - current_free_gb - sum(sizeOnDisk of 'leaving' movies)
 * Returns 0 if no removals are needed.
 */
export function calculateRemovalDeficit(
  targetFreeGb: number,
  currentFreeGb: number,
  leavingSizeGb: number
): number {
  const deficit = targetFreeGb - currentFreeGb - leavingSizeGb;
  return Math.max(0, deficit);
}

// ---------------------------------------------------------------------------
// Eligible movie queries
// ---------------------------------------------------------------------------

export interface EligibleMovie {
  id: number;
  tmdbId: number;
  title: string;
  createdAt: string;
}

/**
 * Get movies eligible for removal, ordered by created_at ASC (oldest first).
 *
 * Excludes:
 * - Watchlist items
 * - Movies with rotation_status = 'protected' (unexpired)
 * - Movies with rotation_status = 'leaving'
 * - Movies currently downloading in Radarr
 * - Movies with sizeOnDisk = 0 in Radarr
 */
export function getEligibleForRemoval(
  movieSizes: MovieSizeMap,
  downloadingTmdbIds: Set<number>
): EligibleMovie[] {
  const db = getDrizzle();
  const now = new Date().toISOString();

  // Get watchlist movie IDs
  const watchlistRows = db
    .select({ mediaId: mediaWatchlist.mediaId })
    .from(mediaWatchlist)
    .where(eq(mediaWatchlist.mediaType, 'movie'))
    .all();
  const watchlistMovieIds = new Set(watchlistRows.map((r) => r.mediaId));

  // Query movies that are NOT leaving and NOT protected (with unexpired protection)
  const candidates = db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
      createdAt: movies.createdAt,
      rotationStatus: movies.rotationStatus,
      rotationExpiresAt: movies.rotationExpiresAt,
    })
    .from(movies)
    .where(
      and(
        // Exclude movies already marked as leaving
        ne(sql`coalesce(${movies.rotationStatus}, '')`, sql`'leaving'`)
      )
    )
    .orderBy(asc(movies.createdAt))
    .all();

  return candidates.filter((m) => {
    // Exclude watchlist items
    if (watchlistMovieIds.has(m.id)) return false;
    // Exclude protected movies with unexpired protection
    if (m.rotationStatus === 'protected' && m.rotationExpiresAt && m.rotationExpiresAt > now) {
      return false;
    }
    // Exclude movies currently downloading
    if (downloadingTmdbIds.has(m.tmdbId)) return false;
    // Exclude movies with no file (sizeOnDisk = 0 or not in Radarr)
    const sizeGb = movieSizes.get(m.tmdbId);
    if (sizeGb === undefined || sizeGb <= 0) return false;
    return true;
  });
}

/**
 * Get the set of TMDB IDs that are currently downloading in Radarr.
 */
export async function getDownloadingTmdbIds(): Promise<Set<number>> {
  const client = getRadarrClient();
  if (!client) return new Set();
  const queue = await client.getQueue();
  // Build a map of Radarr movie ID → TMDB ID from the movie list
  const radarrMovies = await client.getMovies();
  const radarrIdToTmdb = new Map<number, number>();
  for (const m of radarrMovies) {
    radarrIdToTmdb.set(m.id, m.tmdbId);
  }
  const downloading = new Set<number>();
  for (const record of queue.records) {
    const tmdbId = radarrIdToTmdb.get(record.movieId);
    if (tmdbId) downloading.add(tmdbId);
  }
  return downloading;
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export interface RemovalSelection {
  moviesToMark: EligibleMovie[];
  totalSizeGb: number;
}

/**
 * Walk the eligible list oldest-first, accumulating sizeOnDisk, until
 * cumulative size >= deficit. Returns the movies to be marked as leaving.
 */
export function selectMoviesForRemoval(
  eligible: EligibleMovie[],
  movieSizes: MovieSizeMap,
  deficitGb: number
): RemovalSelection {
  if (deficitGb <= 0) return { moviesToMark: [], totalSizeGb: 0 };

  const moviesToMark: EligibleMovie[] = [];
  let totalSizeGb = 0;

  for (const movie of eligible) {
    const sizeGb = movieSizes.get(movie.tmdbId) ?? 0;
    if (sizeGb <= 0) continue;
    moviesToMark.push(movie);
    totalSizeGb += sizeGb;
    if (totalSizeGb >= deficitGb) break;
  }

  return { moviesToMark, totalSizeGb };
}

// ---------------------------------------------------------------------------
// Expired movie processing
// ---------------------------------------------------------------------------

export interface ExpiredMovieResult {
  tmdbId: number;
  title: string;
  success: boolean;
  error?: string;
}

/**
 * Find 'leaving' movies past rotation_expires_at, delete them from Radarr
 * (with files), and remove/update them in the POPS library.
 *
 * Continues on individual failures — never aborts the cycle.
 */
export async function processExpiredMovies(): Promise<ExpiredMovieResult[]> {
  const db = getDrizzle();
  const client = getRadarrClient();
  if (!client) throw new Error('Radarr not configured');

  const now = new Date().toISOString();

  // Find all leaving movies past their expiry
  const expired = db
    .select({
      id: movies.id,
      tmdbId: movies.tmdbId,
      title: movies.title,
    })
    .from(movies)
    .where(and(eq(movies.rotationStatus, 'leaving'), sql`${movies.rotationExpiresAt} <= ${now}`))
    .all();

  const results: ExpiredMovieResult[] = [];

  for (const movie of expired) {
    try {
      // Look up Radarr ID
      const check = await client.checkMovie(movie.tmdbId);
      if (check.exists && check.radarrId != null) {
        await client.deleteMovie(check.radarrId, true);
      }
      // Movie deleted or not in Radarr — clear rotation status in POPS
      db.update(movies)
        .set({
          rotationStatus: null,
          rotationExpiresAt: null,
          rotationMarkedAt: null,
        })
        .where(eq(movies.id, movie.id))
        .run();
      results.push({ tmdbId: movie.tmdbId, title: movie.title, success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Failed to remove expired movie ${movie.title} (tmdb=${movie.tmdbId}):`,
        message
      );
      results.push({
        tmdbId: movie.tmdbId,
        title: movie.title,
        success: false,
        error: message,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Summing leaving movies' sizes
// ---------------------------------------------------------------------------

/**
 * Get the total size in GB of movies currently in the 'leaving' state.
 */
export function getLeavingMovieSizeGb(movieSizes: MovieSizeMap): number {
  const db = getDrizzle();
  const leavingMovies = db
    .select({ tmdbId: movies.tmdbId })
    .from(movies)
    .where(eq(movies.rotationStatus, 'leaving'))
    .all();

  let total = 0;
  for (const m of leavingMovies) {
    total += movieSizes.get(m.tmdbId) ?? 0;
  }
  return total;
}

/**
 * Mark selected movies as 'leaving' with the given expiry date.
 */
export function markMoviesAsLeaving(movieIds: number[], expiresAt: string): void {
  if (movieIds.length === 0) return;
  const db = getDrizzle();
  const now = new Date().toISOString();
  db.update(movies)
    .set({
      rotationStatus: 'leaving',
      rotationExpiresAt: expiresAt,
      rotationMarkedAt: now,
    })
    .where(inArray(movies.id, movieIds))
    .run();
}
