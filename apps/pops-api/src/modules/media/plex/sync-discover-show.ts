import { eq } from 'drizzle-orm';

import { tvShows } from '@pops/db-types';

import { addTvShow } from '../library/tv-show-service.js';
import {
  delay,
  getRateLimitDelayMs,
  pushError,
  type DiscoverItemResult,
} from './sync-discover-types.js';
import { extractExternalIdAsNumber } from './sync-helpers.js';

import type { getDrizzle } from '../../../db.js';
import type { getTvdbClient } from '../thetvdb/index.js';
import type { getImageCache } from '../tmdb/index.js';
import type { PlexClient } from './client.js';

export interface ResolveShowArgs {
  plexClient: PlexClient;
  tvdbClient: ReturnType<typeof getTvdbClient>;
  imageCache: ReturnType<typeof getImageCache>;
  showTitle: string;
  result: DiscoverItemResult;
  db: ReturnType<typeof getDrizzle>;
}

async function findTvdbCandidate(
  plexClient: PlexClient,
  searchResults: Awaited<ReturnType<PlexClient['searchDiscover']>>
): Promise<{ tvdbId: number; ratingKey: string } | null> {
  for (const candidate of searchResults) {
    const meta = await plexClient.getDiscoverMetadata(candidate.ratingKey);
    if (!meta) continue;
    const tvdbId = extractExternalIdAsNumber(meta, 'tvdb');
    if (tvdbId) return { tvdbId, ratingKey: candidate.ratingKey };
  }
  return null;
}

/**
 * Resolve a TV show by title — searches Discover, extracts TVDB ID,
 * and adds to library if not already present.
 *
 * Returns the show info or null if unresolvable.
 */
export async function resolveShow(
  args: ResolveShowArgs
): Promise<{ showId: number; tvdbId: number } | null> {
  const { plexClient, tvdbClient, imageCache, showTitle, result, db } = args;
  try {
    await delay(getRateLimitDelayMs());
    const searchResults = await plexClient.searchDiscover(showTitle, 'show');
    if (searchResults.length === 0) {
      result.notFound++;
      return null;
    }

    const candidate = await findTvdbCandidate(plexClient, searchResults);
    if (!candidate) {
      result.notFound++;
      return null;
    }

    const { tvdbId, ratingKey } = candidate;

    const existingShow = db
      .select({ id: tvShows.id, tvdbId: tvShows.tvdbId })
      .from(tvShows)
      .where(eq(tvShows.tvdbId, tvdbId))
      .get();

    if (existingShow) {
      if (ratingKey) {
        db.update(tvShows)
          .set({ discoverRatingKey: ratingKey })
          .where(eq(tvShows.id, existingShow.id))
          .run();
      }
      return { showId: existingShow.id, tvdbId };
    }

    const { show: newShow } = await addTvShow(tvdbId, tvdbClient, imageCache);
    if (ratingKey) {
      db.update(tvShows)
        .set({ discoverRatingKey: ratingKey })
        .where(eq(tvShows.id, newShow.id))
        .run();
    }
    result.added++;
    return { showId: newShow.id, tvdbId };
  } catch (err) {
    pushError(result, showTitle, err);
    return null;
  }
}
