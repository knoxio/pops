/**
 * TMDB Top Rated rotation source adapter.
 *
 * Fetches top-rated movies from TMDB's discover endpoint, sorted by vote
 * average with a minimum vote-count threshold. Degrades to an empty list when
 * TMDB is unconfigured or a page fetch fails.
 */
import { getTmdbClient } from '../../clients/tmdb/index.js';

import type { CandidateMovie, RotationSourceAdapter } from '../rotation-source-types.js';

const DEFAULT_PAGES = 5;
const MAX_PAGES = 25;
const MIN_VOTE_COUNT = 500;

function resolvePages(config: Record<string, unknown>): number {
  const requested = typeof config.pages === 'number' ? config.pages : DEFAULT_PAGES;
  return Math.min(Math.max(1, requested), MAX_PAGES);
}

export const tmdbTopRatedSource: RotationSourceAdapter = {
  type: 'tmdb_top_rated',

  async fetchCandidates(config: Record<string, unknown>): Promise<CandidateMovie[]> {
    const pages = resolvePages(config);

    let client;
    try {
      client = getTmdbClient();
    } catch {
      console.warn('[tmdb_top_rated] TMDB API key not configured — skipping');
      return [];
    }

    const candidates: CandidateMovie[] = [];
    for (let page = 1; page <= pages; page++) {
      let result;
      try {
        result = await client.discoverMovies({
          sortBy: 'vote_average.desc',
          voteCountGte: MIN_VOTE_COUNT,
          page,
        });
      } catch (err) {
        console.warn(
          `[tmdb_top_rated] Failed fetching page ${page}: ${err instanceof Error ? err.message : String(err)}`
        );
        break;
      }

      for (const movie of result.results) {
        candidates.push({
          tmdbId: movie.tmdbId,
          title: movie.title,
          year: movie.releaseDate ? Number(movie.releaseDate.slice(0, 4)) || null : null,
          rating: movie.voteAverage,
          posterPath: movie.posterPath,
        });
      }

      if (page >= result.totalPages) break;
    }

    return candidates;
  },
};
