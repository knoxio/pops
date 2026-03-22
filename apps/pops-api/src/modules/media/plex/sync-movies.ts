/**
 * Plex movie import — batch sync with progress tracking and fallback matching.
 *
 * Iterates all movies in a Plex library section, matches each to a TMDB ID
 * (via Plex Guid or title+year search), adds to the local library, and
 * logs watch history for watched items.
 */
import type { PlexClient } from "./client.js";
import type { PlexMediaItem } from "./types.js";
import type { TmdbClient } from "../tmdb/client.js";
import { getTmdbClient } from "../tmdb/index.js";
import * as libraryService from "../library/service.js";
import { logWatch } from "../watch-history/service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MovieSyncProgress {
  total: number;
  processed: number;
  synced: number;
  skipped: number;
  errors: MovieSyncError[];
}

export interface MovieSyncError {
  title: string;
  year: number | null;
  reason: string;
}

export interface MovieSyncOptions {
  /** Called after each item is processed. */
  onProgress?: (progress: MovieSyncProgress) => void;
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Import all movies from a Plex library section.
 *
 * For each Plex movie:
 *   1. Try to extract TMDB ID from Plex Guid array
 *   2. If no TMDB ID, fall back to title+year search via TMDB API
 *   3. Add movie to library (idempotent)
 *   4. Log watch history if Plex shows it was watched
 */
export async function importMoviesFromPlex(
  plexClient: PlexClient,
  sectionId: string,
  options: MovieSyncOptions = {}
): Promise<MovieSyncProgress> {
  const tmdbClient = getTmdbClient();
  if (!tmdbClient) {
    return {
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      errors: [{ title: "Configuration", year: null, reason: "TMDB_API_KEY not configured" }],
    };
  }

  const items = await plexClient.getAllItems(sectionId);

  const progress: MovieSyncProgress = {
    total: items.length,
    processed: 0,
    synced: 0,
    skipped: 0,
    errors: [],
  };

  for (const item of items) {
    try {
      await syncSingleMovie(item, tmdbClient, progress);
    } catch (err) {
      progress.errors.push({
        title: item.title,
        year: item.year,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    progress.processed++;
    options.onProgress?.(progress);
  }

  return progress;
}

// ---------------------------------------------------------------------------
// Per-movie sync
// ---------------------------------------------------------------------------

async function syncSingleMovie(
  item: PlexMediaItem,
  tmdbClient: TmdbClient,
  progress: MovieSyncProgress
): Promise<void> {
  // Step 1: Resolve TMDB ID
  const tmdbId = await resolveTmdbId(item, tmdbClient);

  if (!tmdbId) {
    progress.skipped++;
    return;
  }

  // Step 2: Add to library (idempotent)
  const { movie } = await libraryService.addMovie(tmdbId, tmdbClient);

  // Step 3: Sync watch history
  if (item.viewCount > 0 && item.lastViewedAt) {
    try {
      logWatch({
        mediaType: "movie",
        mediaId: movie.id,
        watchedAt: new Date(item.lastViewedAt * 1000).toISOString(),
        completed: 1,
      });
    } catch {
      // Ignore duplicate watch entries
    }
  }

  progress.synced++;
}

// ---------------------------------------------------------------------------
// TMDB ID resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the TMDB ID for a Plex movie.
 *
 * Strategy:
 *   1. Check Plex Guid array for tmdb:// entry
 *   2. Fall back to TMDB search by title + year
 */
async function resolveTmdbId(item: PlexMediaItem, tmdbClient: TmdbClient): Promise<number | null> {
  // Try Plex Guid array first
  const plexTmdbId = item.externalIds.find((id) => id.source === "tmdb");
  if (plexTmdbId) {
    const parsed = Number(plexTmdbId.id);
    if (!Number.isNaN(parsed)) return parsed;
  }

  // Fall back to title+year search
  return searchTmdbByTitleYear(item.title, item.year, tmdbClient);
}

/**
 * Search TMDB for a movie by title and optional year.
 * Returns the first result's TMDB ID if the title is a close match.
 */
async function searchTmdbByTitleYear(
  title: string,
  year: number | null,
  tmdbClient: TmdbClient
): Promise<number | null> {
  try {
    const result = await tmdbClient.searchMovies(title);
    if (result.results.length === 0) return null;

    // Find best match: prefer exact title + matching year
    for (const r of result.results) {
      const titleMatch = r.title.toLowerCase() === title.toLowerCase();
      const yearMatch =
        year && r.releaseDate ? new Date(r.releaseDate).getFullYear() === year : true;

      if (titleMatch && yearMatch) {
        return r.tmdbId;
      }
    }

    // No exact match — take first result if title is close enough
    const first = result.results[0];
    if (first.title.toLowerCase() === title.toLowerCase()) {
      return first.tmdbId;
    }

    return null;
  } catch {
    return null;
  }
}
