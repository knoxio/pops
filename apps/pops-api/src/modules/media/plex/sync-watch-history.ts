/**
 * Standalone watch history sync — re-syncs watch data from Plex for
 * movies and TV shows that are already imported into the local library.
 *
 * Unlike the full sync (sync-movies.ts / sync-tv.ts), this does NOT
 * import new media. It only updates watch history for existing items,
 * returning detailed diagnostics about what matched and what was missed.
 */
import { getDb } from '../../../db.js';
import { getMovieByTmdbId } from '../movies/service.js';
import {
  type EpisodeSyncDiagnostics,
  extractExternalIdAsNumber,
  logMovieWatch,
  syncEpisodeWatches,
} from './sync-helpers.js';

import type { PlexClient } from './client.js';
import type { PlexMediaItem } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-show diagnostics enriched with Plex metadata for display. */
export interface ShowWatchDiagnostics {
  title: string;
  tvdbId: number;
  /** How many episodes Plex reports at the show level (viewedLeafCount). */
  plexViewedLeafCount: number | null;
  diagnostics: EpisodeSyncDiagnostics;
}

export interface MovieWatchSyncResult {
  /** Total Plex movies inspected. */
  total: number;
  /** Movies with viewCount > 0 in Plex. */
  watched: number;
  /** New watch entries logged. */
  logged: number;
  /** Already had a matching watch entry. */
  alreadyLogged: number;
  /** No local movie found for this TMDB ID. */
  noLocalMatch: number;
}

export interface WatchHistorySyncResult {
  movies: MovieWatchSyncResult | null;
  shows: ShowWatchDiagnostics[];
  summary: {
    moviesLogged: number;
    episodesLogged: number;
    /** Episodes already in watch_history from a previous sync. */
    episodesAlreadyLogged: number;
    showsProcessed: number;
    /** Shows where total tracked episodes < Plex viewedLeafCount — indicates genuine gaps. */
    showsWithGaps: number;
  };
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Sync watch history from Plex for already-imported media.
 *
 * @param plexClient - Authenticated Plex client
 * @param movieSectionId - Plex library section ID for movies (optional)
 * @param tvSectionId - Plex library section ID for TV shows (optional)
 */
interface SyncTvShowWatchesArgs {
  plexClient: PlexClient;
  tvItems: PlexMediaItem[];
  startProcessed: number;
  totalItems: number;
  onProgress?: (processed: number, total: number) => void;
}

async function syncTvShowWatches(
  args: SyncTvShowWatchesArgs
): Promise<{ showResults: ShowWatchDiagnostics[]; processed: number }> {
  const { plexClient, tvItems, startProcessed, totalItems, onProgress } = args;
  const showResults: ShowWatchDiagnostics[] = [];
  let processed = startProcessed;

  for (const item of tvItems) {
    const tvdbId = extractExternalIdAsNumber(item, 'tvdb');
    if (!tvdbId) {
      processed++;
      onProgress?.(processed, totalItems);
      continue;
    }

    const plexEpisodes = await plexClient.getEpisodes(item.ratingKey);
    const diagnostics = getDb().transaction(() => syncEpisodeWatches(tvdbId, plexEpisodes))();
    if (diagnostics.plexWatched > 0) {
      showResults.push({
        title: item.title,
        tvdbId,
        plexViewedLeafCount: item.viewedLeafCount,
        diagnostics,
      });
    }
    processed++;
    onProgress?.(processed, totalItems);
  }

  return { showResults, processed };
}

function summariseResults(
  movieResult: MovieWatchSyncResult | null,
  showResults: ShowWatchDiagnostics[]
): WatchHistorySyncResult['summary'] {
  const episodesLogged = showResults.reduce((sum, s) => sum + s.diagnostics.matched, 0);
  const episodesAlreadyLogged = showResults.reduce(
    (sum, s) => sum + s.diagnostics.alreadyLogged,
    0
  );
  const showsWithGaps = showResults.filter((s) => {
    if (s.plexViewedLeafCount === null) return false;
    const totalTracked = s.diagnostics.matched + s.diagnostics.alreadyLogged;
    return totalTracked < s.plexViewedLeafCount;
  }).length;
  return {
    moviesLogged: movieResult?.logged ?? 0,
    episodesLogged,
    episodesAlreadyLogged,
    showsProcessed: showResults.length,
    showsWithGaps,
  };
}

export async function syncWatchHistoryFromPlex(
  plexClient: PlexClient,
  movieSectionId?: string,
  tvSectionId?: string,
  onProgress?: (processed: number, total: number) => void
): Promise<WatchHistorySyncResult> {
  let movieResult: MovieWatchSyncResult | null = null;
  const movieItems = movieSectionId ? await plexClient.getAllItems(movieSectionId) : [];
  const tvItems = tvSectionId ? await plexClient.getAllItems(tvSectionId) : [];
  const totalItems = movieItems.length + tvItems.length;
  let processed = 0;

  if (movieItems.length > 0) {
    movieResult = syncMovieWatches(movieItems);
    processed += movieItems.length;
    onProgress?.(processed, totalItems);
  }

  const { showResults } = await syncTvShowWatches({
    plexClient,
    tvItems,
    startProcessed: processed,
    totalItems,
    onProgress,
  });

  return {
    movies: movieResult,
    shows: showResults,
    summary: summariseResults(movieResult, showResults),
  };
}

// ---------------------------------------------------------------------------
// Movie watch sync (internal)
// ---------------------------------------------------------------------------

/**
 * Sync watch history for movies already in the local library.
 * Does NOT import new movies — only logs watches for existing ones.
 */
function syncMovieWatches(plexItems: PlexMediaItem[]): MovieWatchSyncResult {
  const result: MovieWatchSyncResult = {
    total: plexItems.length,
    watched: 0,
    logged: 0,
    alreadyLogged: 0,
    noLocalMatch: 0,
  };

  for (const item of plexItems) {
    if (item.viewCount === 0) continue;
    result.watched++;

    const tmdbId = extractExternalIdAsNumber(item, 'tmdb');
    if (!tmdbId) {
      result.noLocalMatch++;
      continue;
    }

    const movie = getMovieByTmdbId(tmdbId);
    if (!movie) {
      result.noLocalMatch++;
      continue;
    }

    const created = getDb().transaction(() => {
      return logMovieWatch(movie.id, item.lastViewedAt);
    })();

    if (created) {
      result.logged++;
    } else {
      result.alreadyLogged++;
    }
  }

  return result;
}
