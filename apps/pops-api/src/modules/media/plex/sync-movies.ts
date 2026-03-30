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
import { getDb } from "../../../db.js";
import { getMovieByTmdbId, createMovie } from "../movies/service.js";
import { toMovie } from "../movies/types.js";
import { logMovieWatch } from "./sync-helpers.js";

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
  // Step 1: Resolve TMDB ID (may call external API)
  const tmdbId = await resolveTmdbId(item, tmdbClient);

  if (!tmdbId) {
    progress.skipped++;
    return;
  }

  // Step 2: Check if already in library (idempotent)
  const existing = getMovieByTmdbId(tmdbId);

  if (existing) {
    // Movie exists — only sync watch history in a transaction
    getDb().transaction(() => {
      if (item.viewCount > 0) {
        logMovieWatch(existing.id, item.lastViewedAt);
      }
    })();
  } else {
    // Fetch TMDB detail outside transaction (async)
    const detail = await tmdbClient.getMovie(tmdbId);

    // All DB writes in a single transaction (atomic per movie)
    getDb().transaction(() => {
      const movie = toMovie(
        createMovie({
          tmdbId: detail.tmdbId,
          imdbId: detail.imdbId,
          title: detail.title,
          originalTitle: detail.originalTitle,
          overview: detail.overview,
          tagline: detail.tagline,
          releaseDate: detail.releaseDate,
          runtime: detail.runtime,
          status: detail.status,
          originalLanguage: detail.originalLanguage,
          budget: detail.budget,
          revenue: detail.revenue,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          voteAverage: detail.voteAverage,
          voteCount: detail.voteCount,
          genres: detail.genres.map((g) => g.name),
        })
      );

      if (item.viewCount > 0) {
        logMovieWatch(movie.id, item.lastViewedAt);
      }
    })();
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
    if (first && first.title.toLowerCase() === title.toLowerCase()) {
      return first.tmdbId;
    }

    return null;
  } catch {
    return null;
  }
}
