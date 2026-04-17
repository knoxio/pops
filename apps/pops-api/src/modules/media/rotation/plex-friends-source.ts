/**
 * Plex friends watchlist rotation source adapter.
 *
 * PRD-071 US-03: fetches a friend's public Plex watchlist and extracts
 * movie candidates with TMDB IDs for rotation discovery.
 *
 * Config shape:
 *   { friendUuid: string, friendUsername?: string }
 *
 * The friendUuid is required and used to fetch the friend's watchlist
 * via the Plex Discover API. friendUsername is optional metadata.
 */
import { logger } from '../../../lib/logger.js';
import { fetchFriendWatchlist } from '../plex/friends.js';
import { getPlexClientId, getPlexToken } from '../plex/service.js';

import type { CandidateMovie, RotationSourceAdapter } from './source-types.js';

export const plexFriendsSource: RotationSourceAdapter = {
  type: 'plex_friends',

  async fetchCandidates(config: Record<string, unknown>): Promise<CandidateMovie[]> {
    const friendUuid = config.friendUuid;
    if (!friendUuid || typeof friendUuid !== 'string') {
      throw new Error('plex_friends source requires "friendUuid" in config');
    }

    const token = getPlexToken();
    if (!token) {
      throw new Error('Plex token not configured — cannot fetch friend watchlist');
    }

    const clientId = getPlexClientId();
    const friendLabel = (config.friendUsername as string | undefined) ?? friendUuid;

    let watchlistItems: Awaited<ReturnType<typeof fetchFriendWatchlist>>;
    try {
      watchlistItems = await fetchFriendWatchlist(token, clientId, friendUuid);
    } catch (err) {
      // Log warning and return empty on access errors (private watchlist, etc.)
      logger.warn(
        { err, friendUuid, friendLabel },
        `Could not access friend watchlist for ${friendLabel} — returning empty candidates`
      );
      return [];
    }

    if (watchlistItems.length === 0) {
      logger.info(
        { friendUuid, friendLabel },
        `Friend ${friendLabel} has no accessible movie watchlist items`
      );
    }

    return watchlistItems.map((item) => ({
      tmdbId: item.tmdbId,
      title: item.title,
      year: item.year,
      rating: null, // Friend watchlist items don't include ratings
      posterPath: null, // Resolved later during candidate processing
    }));
  },
};
