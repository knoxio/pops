/**
 * Radarr-backed removal helpers for the rotation cycle (api-layer).
 *
 * Wraps the env-configured Radarr client: free disk space, per-movie sizes,
 * the active download set, and the expiry sweep that deletes `leaving` movies
 * (with files) once their window elapses and clears their POPS rotation flags.
 * Ported from the monolith `removal-selection.ts` (the Radarr parts). The pure
 * SQLite queries live in the db `removal-queries.ts` service; the pure math in
 * `rotation-cycle-types.ts`.
 */
import { type MediaDb, type MovieSizeMap, rotationRemovalQueries } from '../../db/index.js';
import { type RadarrClient } from '../clients/arr/index.js';
import {
  bytesToGb,
  type RotationFailedMovieRef,
  type RotationMovieRef,
} from './rotation-cycle-types.js';

/** Free space in GB of Radarr's primary (first) disk. Throws if unavailable. */
export async function getRadarrDiskSpace(client: RadarrClient): Promise<number> {
  const disks = await client.getDiskSpace();
  const disk = disks[0];
  if (!disk) throw new Error('Radarr returned no disk space info');
  return bytesToGb(disk.freeSpace);
}

/** Map of TMDB id → size in GB for every Radarr movie with a file on disk. */
export async function getRadarrMovieSizes(client: RadarrClient): Promise<MovieSizeMap> {
  const radarrMovies = await client.getMovies();
  const map: MovieSizeMap = new Map();
  for (const m of radarrMovies) {
    if (m.sizeOnDisk && m.sizeOnDisk > 0) map.set(m.tmdbId, bytesToGb(m.sizeOnDisk));
  }
  return map;
}

/** TMDB ids currently downloading in Radarr (queue ↔ movie-list join). */
export async function getDownloadingTmdbIds(client: RadarrClient): Promise<Set<number>> {
  const [queue, radarrMovies] = await Promise.all([client.getQueue(), client.getMovies()]);
  const radarrIdToTmdb = new Map<number, number>();
  for (const m of radarrMovies) radarrIdToTmdb.set(m.id, m.tmdbId);
  const downloading = new Set<number>();
  for (const record of queue.records) {
    const tmdbId = radarrIdToTmdb.get(record.movieId);
    if (tmdbId) downloading.add(tmdbId);
  }
  return downloading;
}

export interface ExpiredOutcome {
  removed: RotationMovieRef[];
  failed: RotationFailedMovieRef[];
}

/**
 * Delete each expired `leaving` movie from Radarr (with files) and clear its
 * POPS rotation flags. Continues on individual failures — one bad delete never
 * aborts the sweep. Returns the per-movie removed / failed lists.
 */
export async function processExpiredMovies(
  db: MediaDb,
  client: RadarrClient
): Promise<ExpiredOutcome> {
  const expired = rotationRemovalQueries.getExpiredLeavingMovies(db);
  const removed: RotationMovieRef[] = [];
  const failed: RotationFailedMovieRef[] = [];

  for (const movie of expired) {
    try {
      const check = await client.checkMovie(movie.tmdbId);
      if (check.exists && check.radarrId != null) {
        await client.deleteMovie(check.radarrId, true);
      }
      rotationRemovalQueries.clearRotationStatus(db, movie.id);
      removed.push({ tmdbId: movie.tmdbId, title: movie.title });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(
        `[rotation] Failed to remove expired movie ${movie.title} (tmdb=${movie.tmdbId}): ${error}`
      );
      failed.push({ tmdbId: movie.tmdbId, title: movie.title, error });
    }
  }

  return { removed, failed };
}
