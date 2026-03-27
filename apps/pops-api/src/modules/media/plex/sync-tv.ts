/**
 * Plex TV show import — batch sync with progress tracking and episode watch matching.
 *
 * Iterates all TV shows in a Plex library section, matches each to a TVDB ID
 * (via Plex Guid), adds to the local library, fetches episodes from Plex,
 * and logs watch history for watched episodes.
 */
import type { PlexClient } from "./client.js";
import type { PlexMediaItem } from "./types.js";
import type { TheTvdbClient } from "../thetvdb/client.js";
import { getTvdbClient } from "../thetvdb/index.js";
import { getDb } from "../../../db.js";
import * as tvShowService from "../library/tv-show-service.js";
import { extractExternalIdAsNumber, syncEpisodeWatches } from "./sync-helpers.js";

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
  const tvdbId = extractExternalIdAsNumber(item, "tvdb");

  if (!tvdbId) {
    progress.skipped++;
    return;
  }

  // Step 2: Add to library (idempotent, has internal transaction)
  await tvShowService.addTvShow(tvdbId, tvdbClient);

  // Step 3: Fetch episodes from Plex (async)
  const plexEpisodes = await plexClient.getEpisodes(item.ratingKey);

  // Step 4: Wrap episode watch syncing in a transaction for atomicity
  const matched = getDb().transaction(() => {
    return syncEpisodeWatches(tvdbId, plexEpisodes);
  })();
  progress.episodesMatched += matched;

  progress.synced++;
}
