/**
 * Plex TV-show import — iterate a Plex TV section, match each show to a TVDB
 * id (via Plex Guid), add to the local library (show + seasons + episodes),
 * fetch episodes from Plex, and log watch history for watched episodes.
 *
 * Ported from the monolith `media/plex/sync-tv.ts`. Show ingestion delegates
 * to the pillar's `addTvShow` use-case (which self-transacts); episode watch
 * matching delegates to `syncEpisodeWatches`.
 */
import { type MediaDb } from '../../../../db/index.js';
import { addTvShow } from '../../../modules/tv-ingest.js';
import { syncEpisodeWatches } from './sync-episode-match.js';
import { extractExternalIdAsNumber } from './sync-helpers.js';

import type { TheTvdbClient } from '../../thetvdb/index.js';
import type { ImageCacheService } from '../../tmdb/image-cache.js';
import type { PlexClient } from '../client.js';
import type { PlexMediaItem } from '../types.js';

export interface TvSyncSkip {
  title: string;
  year: number | null;
  reason: string;
}

export interface TvSyncError {
  title: string;
  year: number | null;
  reason: string;
}

export interface TvSyncProgress {
  total: number;
  processed: number;
  synced: number;
  skipped: number;
  episodesMatched: number;
  errors: TvSyncError[];
  skipReasons: TvSyncSkip[];
}

export interface TvSyncOptions {
  onProgress?: (progress: TvSyncProgress) => void;
}

interface TvSyncDeps {
  db: MediaDb;
  plexClient: PlexClient;
  tvdbClient: TheTvdbClient;
  imageCache: ImageCacheService;
}

async function syncSingleShow(
  deps: TvSyncDeps,
  item: PlexMediaItem,
  progress: TvSyncProgress
): Promise<void> {
  const tvdbId = extractExternalIdAsNumber(item, 'tvdb');
  if (!tvdbId) {
    const hasTvdbGuid = item.externalIds.some((id) => id.source === 'tvdb');
    progress.skipped++;
    progress.skipReasons.push({
      title: item.title,
      year: item.year,
      reason: hasTvdbGuid ? 'TVDB ID is not a valid number' : 'No TVDB ID in Plex metadata',
    });
    return;
  }

  await addTvShow(deps.db, tvdbId, deps.tvdbClient, deps.imageCache);
  const plexEpisodes = await deps.plexClient.getEpisodes(item.ratingKey);
  const diagnostics = syncEpisodeWatches(deps.db, tvdbId, plexEpisodes);
  progress.episodesMatched += diagnostics.matched;
  progress.synced++;
}

/** Import all TV shows from a Plex library section. */
export async function importTvShowsFromPlex(
  deps: TvSyncDeps,
  sectionId: string,
  options: TvSyncOptions = {}
): Promise<TvSyncProgress> {
  const items = await deps.plexClient.getAllItems(sectionId);
  const progress: TvSyncProgress = {
    total: items.length,
    processed: 0,
    synced: 0,
    skipped: 0,
    episodesMatched: 0,
    errors: [],
    skipReasons: [],
  };

  for (const item of items) {
    try {
      await syncSingleShow(deps, item, progress);
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
