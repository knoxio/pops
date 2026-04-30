import { and, eq } from 'drizzle-orm';

import { episodes, seasons } from '@pops/db-types';

import { logWatch } from '../watch-history/service.js';
import { resolveShow } from './sync-discover-show.js';
import { pushError, type DiscoverItemResult } from './sync-discover-types.js';
import { hasNearDuplicateWatch } from './sync-helpers.js';

import type { getDrizzle } from '../../../db.js';
import type { getTvdbClient } from '../thetvdb/index.js';
import type { getImageCache } from '../tmdb/index.js';
import type { PlexClient } from './client.js';
import type { ActivityWatchEntry } from './sync-discover-graphql.js';

export type ShowCache = Map<string, { showId: number; tvdbId: number } | null>;

export interface ProcessEpisodeEntryArgs {
  entry: ActivityWatchEntry;
  plexClient: PlexClient;
  tvdbClient: ReturnType<typeof getTvdbClient>;
  imageCache: ReturnType<typeof getImageCache>;
  showCache: ShowCache;
  result: DiscoverItemResult;
  db: ReturnType<typeof getDrizzle>;
}

interface FindEpisodeArgs {
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  db: ReturnType<typeof getDrizzle>;
}

function findEpisodeRow(args: FindEpisodeArgs): { id: number } | null {
  const { showId, seasonNumber, episodeNumber, db } = args;
  const season = db
    .select({ id: seasons.id })
    .from(seasons)
    .where(and(eq(seasons.tvShowId, showId), eq(seasons.seasonNumber, seasonNumber)))
    .get();
  if (!season) return null;
  const episode = db
    .select({ id: episodes.id })
    .from(episodes)
    .where(and(eq(episodes.seasonId, season.id), eq(episodes.episodeNumber, episodeNumber)))
    .get();
  return episode ?? null;
}

async function getOrResolveShow(
  args: ProcessEpisodeEntryArgs,
  showTitle: string
): Promise<{ showId: number; tvdbId: number } | null> {
  const { showCache, plexClient, tvdbClient, imageCache, result, db } = args;
  let showInfo = showCache.get(showTitle);
  if (showInfo === undefined) {
    showInfo = await resolveShow({ plexClient, tvdbClient, imageCache, showTitle, result, db });
    showCache.set(showTitle, showInfo);
  }
  return showInfo;
}

/**
 * Process an EPISODE watch entry from the Plex Discover activity feed.
 *
 * 1. Resolve the show (by grandparent title) — add to library if missing
 * 2. Find the episode by season + episode number
 * 3. Log the watch
 */
export async function processEpisodeEntry(args: ProcessEpisodeEntryArgs): Promise<void> {
  const { entry, showCache, result, db } = args;
  const meta = entry.metadataItem;
  const showTitle = meta.grandparent?.title ?? meta.title;
  const seasonNumber = meta.parent?.index ?? 0;
  const episodeNumber = meta.index;

  try {
    const showInfo = await getOrResolveShow(args, showTitle);
    if (!showInfo) {
      if (showCache.get(showTitle) === null) {
        result.notFound++;
      }
      return;
    }

    const episode = findEpisodeRow({
      showId: showInfo.showId,
      seasonNumber,
      episodeNumber,
      db,
    });
    if (!episode) {
      result.notFound++;
      return;
    }

    result.watched++;
    if (hasNearDuplicateWatch('episode', episode.id, entry.date)) {
      result.alreadyLogged++;
      return;
    }
    const logResult = logWatch({
      mediaType: 'episode',
      mediaId: episode.id,
      watchedAt: entry.date,
      completed: 1,
      source: 'plex_sync',
    });
    if (logResult.created) result.logged++;
    else result.alreadyLogged++;
  } catch (err) {
    pushError(result, `${showTitle} S${seasonNumber}E${episodeNumber}`, err);
  }
}
