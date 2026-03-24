/**
 * Shared helpers for Plex sync operations.
 *
 * Extracted from service.ts, sync-movies.ts, and sync-tv.ts to eliminate
 * duplicated watch-history logging and external ID extraction logic.
 */
import { eq, and } from "drizzle-orm";
import { episodes, seasons } from "@pops/db-types";
import type { PlexMediaItem, PlexEpisode } from "./types.js";
import { getDrizzle } from "../../../db.js";
import { getTvShowByTvdbId } from "../tv-shows/service.js";
import { logWatch } from "../watch-history/service.js";

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
 */
export function logMovieWatch(movieId: number, lastViewedAtUnix: number): void {
  try {
    logWatch({
      mediaType: "movie",
      mediaId: movieId,
      watchedAt: new Date(lastViewedAtUnix * 1000).toISOString(),
      completed: 1,
      source: "plex_sync",
    });
  } catch {
    // Ignore duplicate watch entries
  }
}

/**
 * Match Plex episodes to local DB episodes by season+episode number
 * and log watch history for watched episodes.
 *
 * Returns the number of episodes matched and logged.
 */
export function syncEpisodeWatches(tvdbId: number, plexEpisodes: PlexEpisode[]): number {
  const show = getTvShowByTvdbId(tvdbId);
  if (!show) return 0;

  const db = getDrizzle();
  let matched = 0;

  for (const plexEp of plexEpisodes) {
    if (plexEp.viewCount === 0) continue;

    try {
      // Find the local season
      const season = db
        .select()
        .from(seasons)
        .where(and(eq(seasons.tvShowId, show.id), eq(seasons.seasonNumber, plexEp.seasonIndex)))
        .get();
      if (!season) continue;

      // Find the local episode
      const episode = db
        .select()
        .from(episodes)
        .where(
          and(eq(episodes.seasonId, season.id), eq(episodes.episodeNumber, plexEp.episodeIndex))
        )
        .get();
      if (!episode) continue;

      logWatch({
        mediaType: "episode",
        mediaId: episode.id,
        watchedAt: plexEp.lastViewedAt
          ? new Date(plexEp.lastViewedAt * 1000).toISOString()
          : new Date().toISOString(),
        completed: 1,
        source: "plex_sync",
      });

      matched++;
    } catch {
      // Ignore duplicate or failed episode watch entries
    }
  }

  return matched;
}
