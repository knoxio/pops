/**
 * Standalone watch-history sync — re-syncs watch data from Plex for movies
 * and TV shows that are ALREADY in the local library. Unlike the full sync
 * (sync-movies / sync-tv) it does not import new media.
 *
 * Ported from the monolith `media/plex/sync-watch-history.ts`, converted to
 * the pillar's `(db, …)` services.
 */
import { type MediaDb, moviesService } from '../../../../db/index.js';
import { type EpisodeSyncDiagnostics, syncEpisodeWatches } from './sync-episode-match.js';
import { extractExternalIdAsNumber, logMovieWatch } from './sync-helpers.js';

import type { PlexClient } from '../client.js';
import type { PlexMediaItem } from '../types.js';

export interface ShowWatchDiagnostics {
  title: string;
  tvdbId: number;
  plexViewedLeafCount: number | null;
  diagnostics: EpisodeSyncDiagnostics;
}

export interface MovieWatchSyncResult {
  total: number;
  watched: number;
  logged: number;
  alreadyLogged: number;
  noLocalMatch: number;
}

export interface WatchHistorySyncResult {
  movies: MovieWatchSyncResult | null;
  shows: ShowWatchDiagnostics[];
  summary: {
    moviesLogged: number;
    episodesLogged: number;
    episodesAlreadyLogged: number;
    showsProcessed: number;
    showsWithGaps: number;
  };
}

function syncMovieWatches(db: MediaDb, plexItems: PlexMediaItem[]): MovieWatchSyncResult {
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
    const movie = moviesService.getMovieByTmdbId(db, tmdbId);
    if (!movie) {
      result.noLocalMatch++;
      continue;
    }
    if (logMovieWatch(db, movie.id, item.lastViewedAt)) result.logged++;
    else result.alreadyLogged++;
  }
  return result;
}

async function syncTvShowWatches(
  db: MediaDb,
  plexClient: PlexClient,
  tvItems: PlexMediaItem[]
): Promise<ShowWatchDiagnostics[]> {
  const showResults: ShowWatchDiagnostics[] = [];
  for (const item of tvItems) {
    const tvdbId = extractExternalIdAsNumber(item, 'tvdb');
    if (!tvdbId) continue;
    const plexEpisodes = await plexClient.getEpisodes(item.ratingKey);
    const diagnostics = syncEpisodeWatches(db, tvdbId, plexEpisodes);
    if (diagnostics.plexWatched > 0) {
      showResults.push({
        title: item.title,
        tvdbId,
        plexViewedLeafCount: item.viewedLeafCount,
        diagnostics,
      });
    }
  }
  return showResults;
}

function summarise(
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

/** Re-sync watch history for already-imported movies + TV shows. */
export async function syncWatchHistoryFromPlex(
  db: MediaDb,
  plexClient: PlexClient,
  movieSectionId?: string,
  tvSectionId?: string
): Promise<WatchHistorySyncResult> {
  const movieItems = movieSectionId ? await plexClient.getAllItems(movieSectionId) : [];
  const tvItems = tvSectionId ? await plexClient.getAllItems(tvSectionId) : [];

  const movieResult = movieItems.length > 0 ? syncMovieWatches(db, movieItems) : null;
  const showResults = await syncTvShowWatches(db, plexClient, tvItems);

  return {
    movies: movieResult,
    shows: showResults,
    summary: summarise(movieResult, showResults),
  };
}
