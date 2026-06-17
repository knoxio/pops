/**
 * Plex friends watchlist rotation source adapter.
 *
 * Fetches a friend's shared Plex watchlist and maps movies with TMDB IDs to
 * candidates. Config shape: `{ friendUuid: string, friendUsername?: string }`.
 * Degrades to an empty list on access errors (private watchlist, etc.).
 */
import { fetchFriendWatchlist } from '../../clients/plex/index.js';

import type {
  CandidateMovie,
  RotationSourceAdapter,
  RotationSourceDeps,
} from '../rotation-source-types.js';

export const plexFriendsSource: RotationSourceAdapter = {
  type: 'plex_friends',

  async fetchCandidates(
    config: Record<string, unknown>,
    deps: RotationSourceDeps
  ): Promise<CandidateMovie[]> {
    const friendUuid = config.friendUuid;
    if (typeof friendUuid !== 'string' || !friendUuid) {
      throw new Error('plex_friends source requires "friendUuid" in config');
    }
    if (deps.plexToken === null || deps.plexClientId === null) {
      throw new Error('Plex token not configured — cannot fetch friend watchlist');
    }

    const friendLabel = (config.friendUsername as string | undefined) ?? friendUuid;

    let watchlistItems: Awaited<ReturnType<typeof fetchFriendWatchlist>>;
    try {
      watchlistItems = await fetchFriendWatchlist({
        token: deps.plexToken,
        clientId: deps.plexClientId,
        friendUuid,
      });
    } catch (err) {
      console.warn(
        `[plex_friends] Could not access friend watchlist for ${friendLabel}: ${err instanceof Error ? err.message : String(err)}`
      );
      return [];
    }

    return watchlistItems.map((item) => ({
      tmdbId: item.tmdbId,
      title: item.title,
      year: item.year,
      rating: null,
      posterPath: null,
    }));
  },
};
