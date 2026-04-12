/**
 * Plex watchlist rotation source adapter.
 *
 * PRD-071 US-02: fetches the user's Plex Discover watchlist and
 * extracts TMDB IDs for rotation candidate discovery.
 */
import { extractExternalIdAsNumber } from '../plex/sync-helpers.js';
import { getPlexClientId, getPlexToken } from '../plex/service.js';
import { fetchPlexWatchlist } from '../plex/sync-watchlist.js';
import type { CandidateMovie, RotationSourceAdapter } from './source-types.js';

export const plexWatchlistSource: RotationSourceAdapter = {
  type: 'plex_watchlist',

  async fetchCandidates(_config: Record<string, unknown>): Promise<CandidateMovie[]> {
    const token = getPlexToken();
    if (!token) {
      throw new Error('Plex token not configured — cannot fetch watchlist');
    }

    const clientId = getPlexClientId();
    const watchlistItems = await fetchPlexWatchlist(token, clientId);

    const candidates: CandidateMovie[] = [];

    for (const item of watchlistItems) {
      // Only include movies (skip TV shows)
      if (item.type !== 'movie') continue;

      const tmdbId = extractExternalIdAsNumber(item, 'tmdb');
      if (!tmdbId) continue;

      candidates.push({
        tmdbId,
        title: item.title,
        year: item.year,
        rating: item.audienceRating ?? item.rating ?? null,
        posterPath: item.thumbUrl,
      });
    }

    return candidates;
  },
};
