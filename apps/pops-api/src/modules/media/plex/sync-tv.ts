/**
 * Plex TV show import — batch sync with progress tracking and episode watch matching.
 *
 * Iterates all TV shows in a Plex library section, matches each to a TVDB ID
 * (via Plex Guid), adds to the local library, fetches episodes from Plex,
 * and logs watch history for watched episodes.
 */
import type { PlexClient } from "./client.js";
import type { PlexMediaItem, PlexEpisode } from "./types.js";
import type { TheTvdbClient } from "../thetvdb/client.js";
import { getTvdbClient } from "../thetvdb/index.js";
import * as tvShowService from "../library/tv-show-service.js";
import { getTvShowByTvdbId } from "../tv-shows/service.js";
import { logWatch } from "../watch-history/service.js";
import { getDrizzle } from "../../../db.js";
import { episodes, seasons } from "@pops/db-types";
import { eq, and } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TvSyncProgress {
  total: number;
  processed: number;
  synced: number;
  skipped: number;
  episodesMatched: number;
  errors: TvSyncError[];
}

export interface TvSyncError {
  title: string;
  year: number | null;
  reason: string;
}

export interface TvSyncOptions {
  /** Called after each show is processed. */
  onProgress?: (progress: TvSyncProgress) => void;
}

// ---------------------------------------------------------------------------
// Main sync function
// ---------------------------------------------------------------------------

/**
 * Import all TV shows from a Plex library section.
 *
 * For each Plex TV show:
 *   1. Extract TVDB ID from Plex Guid array
 *   2. Add show to library via addTvShow (idempotent)
 *   3. Fetch episodes from Plex
 *   4. Match watched episodes to local DB and log watch history
 */
export async function importTvShowsFromPlex(
  plexClient: PlexClient,
  sectionId: string,
  options: TvSyncOptions = {}
): Promise<TvSyncProgress> {
  const tvdbClient = getTvdbClient();
  if (!tvdbClient) {
    return {
      total: 0,
      processed: 0,
      synced: 0,
      skipped: 0,
      episodesMatched: 0,
      errors: [{ title: "Configuration", year: null, reason: "THETVDB_API_KEY not configured" }],
    };
  }

  const items = await plexClient.getAllItems(sectionId);

  const progress: TvSyncProgress = {
    total: items.length,
    processed: 0,
    synced: 0,
    skipped: 0,
    episodesMatched: 0,
    errors: [],
  };

  for (const item of items) {
    try {
      await syncSingleShow(item, plexClient, tvdbClient, progress);
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
// Per-show sync
// ---------------------------------------------------------------------------

async function syncSingleShow(
  item: PlexMediaItem,
  plexClient: PlexClient,
  tvdbClient: TheTvdbClient,
  progress: TvSyncProgress
): Promise<void> {
  // Step 1: Resolve TVDB ID
  const tvdbId = resolveTvdbId(item);

  if (!tvdbId) {
    progress.skipped++;
    return;
  }

  // Step 2: Add to library (idempotent)
  await tvShowService.addTvShow(tvdbId, tvdbClient);

  // Step 3: Sync episode watches
  const plexEpisodes = await plexClient.getEpisodes(item.ratingKey);
  const matched = syncEpisodeWatches(tvdbId, plexEpisodes);
  progress.episodesMatched += matched;

  progress.synced++;
}

// ---------------------------------------------------------------------------
// TVDB ID resolution
// ---------------------------------------------------------------------------

/**
 * Extract TVDB ID from a Plex media item's Guid array.
 * Returns null if no TVDB Guid is found or the ID is not numeric.
 */
function resolveTvdbId(item: PlexMediaItem): number | null {
  const tvdbGuid = item.externalIds.find((id) => id.source === "tvdb");
  if (!tvdbGuid) return null;

  const parsed = Number(tvdbGuid.id);
  if (Number.isNaN(parsed)) return null;

  return parsed;
}

// ---------------------------------------------------------------------------
// Episode watch sync
// ---------------------------------------------------------------------------

/**
 * Match Plex episodes to local DB episodes by season+episode number
 * and log watch history for watched episodes.
 *
 * Returns the number of episodes matched and logged.
 */
function syncEpisodeWatches(tvdbId: number, plexEpisodes: PlexEpisode[]): number {
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
