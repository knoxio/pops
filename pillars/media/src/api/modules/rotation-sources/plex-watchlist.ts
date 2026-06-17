import { extractExternalIdAsNumber } from '../../clients/plex/sync/sync-helpers.js';
/**
 * Plex watchlist rotation source adapter.
 *
 * Fetches the user's own Plex Discover watchlist and maps movies (skipping TV)
 * with TMDB IDs to candidates.
 */
import { fetchPlexWatchlist } from '../../clients/plex/sync/sync-watchlist-fetch.js';

import type {
  CandidateMovie,
  RotationSourceAdapter,
  RotationSourceDeps,
} from '../rotation-source-types.js';

export const plexWatchlistSource: RotationSourceAdapter = {
  type: 'plex_watchlist',

  async fetchCandidates(
    _config: Record<string, unknown>,
    deps: RotationSourceDeps
  ): Promise<CandidateMovie[]> {
    if (deps.plexToken === null || deps.plexClientId === null) {
      throw new Error('Plex token not configured — cannot fetch watchlist');
    }

    const watchlistItems = await fetchPlexWatchlist(deps.plexToken, deps.plexClientId);
    const candidates: CandidateMovie[] = [];

    for (const item of watchlistItems) {
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
