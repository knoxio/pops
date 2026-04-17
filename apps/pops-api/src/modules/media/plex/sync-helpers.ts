import { and, eq } from 'drizzle-orm';

/**
 * Shared helpers for Plex sync operations.
 *
 * Extracted from service.ts, sync-movies.ts, and sync-tv.ts to eliminate
 * duplicated watch-history logging and external ID extraction logic.
 */
import { episodes, seasons } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getTvShowByTvdbId } from '../tv-shows/service.js';
import { logWatch } from '../watch-history/service.js';

import type { PlexClient } from './client.js';
import type { PlexEpisode, PlexMediaItem } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-episode mismatch detail for diagnostics. */
export interface EpisodeMismatch {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

/** Detailed diagnostics returned by syncEpisodeWatches. */
export interface EpisodeSyncDiagnostics {
  /** Total episodes returned from Plex for this show. */
  plexTotal: number;
  /** Episodes with viewCount > 0 in Plex. */
  plexWatched: number;
  /** Successfully matched and logged to local DB. */
  matched: number;
  /** Already existed in watch_history (duplicate). */
  alreadyLogged: number;
  /** Plex episodes whose season number has no local match. */
  seasonNotFound: number;
  /** Plex episodes whose episode number has no local match within a matched season. */
  episodeNotFound: number;
  /** First few missing seasons (for display). */
  missingSeasonsPreview: number[];
  /** First few missing episodes (for display). */
  missingEpisodesPreview: EpisodeMismatch[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the Discover ratingKey whose metadata contains a matching external ID.
 *
 * Search results don't include Guid arrays, so this fetches full metadata
 * for each candidate and compares the given source/ID pair.
 */
export async function findDiscoverMatch(
  client: PlexClient,
  candidates: PlexMediaItem[],
  source: string,
  expectedId: number
): Promise<string | null> {
  for (const item of candidates) {
    const meta = await client.getDiscoverMetadata(item.ratingKey);
    if (!meta) continue;
    const id = extractExternalIdAsNumber(meta, source);
    if (id === expectedId) return item.ratingKey;
  }
  return null;
}

/**
 * Extract an external ID (tmdb, tvdb, imdb) from a Plex media item
 * and parse it as a number. Returns null if not found or not numeric.
 */
export function extractExternalIdAsNumber(item: PlexMediaItem, source: string): number | null {
  const match = item.externalIds.find((id) => id.source === source);
  if (!match) return null;

  const parsed = Number(match.id);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Log a movie watch event from Plex data.
 * Silently ignores duplicate watch entries.
 * Returns true if a new entry was created, false if duplicate.
 */
export function logMovieWatch(movieId: number, lastViewedAtUnix: number | null): boolean {
  try {
    const result = logWatch({
      mediaType: 'movie',
      mediaId: movieId,
      watchedAt: lastViewedAtUnix
        ? new Date(lastViewedAtUnix * 1000).toISOString()
        : new Date().toISOString(),
      completed: 1,
      source: 'plex_sync',
    });
    return result.created;
  } catch {
    return false;
  }
}

/**
 * Match Plex episodes to local DB episodes by season+episode number
 * and log watch history for watched episodes.
 *
 * Returns detailed diagnostics about what was matched, skipped, and why.
 */
export function syncEpisodeWatches(
  tvdbId: number,
  plexEpisodes: PlexEpisode[]
): EpisodeSyncDiagnostics {
  const emptyResult: EpisodeSyncDiagnostics = {
    plexTotal: plexEpisodes.length,
    plexWatched: 0,
    matched: 0,
    alreadyLogged: 0,
    seasonNotFound: 0,
    episodeNotFound: 0,
    missingSeasonsPreview: [],
    missingEpisodesPreview: [],
  };

  const show = getTvShowByTvdbId(tvdbId);
  if (!show) return emptyResult;

  const db = getDrizzle();
  const diagnostics: EpisodeSyncDiagnostics = { ...emptyResult };
  const missingSeasonsSet = new Set<number>();
  const PREVIEW_LIMIT = 10;

  for (const plexEp of plexEpisodes) {
    if (plexEp.viewCount === 0) continue;
    diagnostics.plexWatched++;

    try {
      // Find the local season
      const season = db
        .select()
        .from(seasons)
        .where(and(eq(seasons.tvShowId, show.id), eq(seasons.seasonNumber, plexEp.seasonIndex)))
        .get();

      if (!season) {
        diagnostics.seasonNotFound++;
        missingSeasonsSet.add(plexEp.seasonIndex);
        continue;
      }

      // Find the local episode
      const episode = db
        .select()
        .from(episodes)
        .where(
          and(eq(episodes.seasonId, season.id), eq(episodes.episodeNumber, plexEp.episodeIndex))
        )
        .get();

      if (!episode) {
        diagnostics.episodeNotFound++;
        if (diagnostics.missingEpisodesPreview.length < PREVIEW_LIMIT) {
          diagnostics.missingEpisodesPreview.push({
            seasonNumber: plexEp.seasonIndex,
            episodeNumber: plexEp.episodeIndex,
            title: plexEp.title,
          });
        }
        continue;
      }

      const result = logWatch({
        mediaType: 'episode',
        mediaId: episode.id,
        watchedAt: plexEp.lastViewedAt
          ? new Date(plexEp.lastViewedAt * 1000).toISOString()
          : new Date().toISOString(),
        completed: 1,
        source: 'plex_sync',
      });

      if (result.created) {
        diagnostics.matched++;
      } else {
        diagnostics.alreadyLogged++;
      }
    } catch {
      // Truly unexpected error (not a duplicate)
      diagnostics.alreadyLogged++;
    }
  }

  diagnostics.missingSeasonsPreview = [...missingSeasonsSet].slice(0, PREVIEW_LIMIT);
  return diagnostics;
}
