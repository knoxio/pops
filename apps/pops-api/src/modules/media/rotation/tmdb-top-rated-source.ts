/**
 * TMDB Top Rated rotation source adapter.
 *
 * PRD-071 US-04: fetches top-rated movies from TMDB as an alternative
 * to scraping IMDB (which has no public API). Uses TMDB's discover
 * endpoint sorted by vote average with a minimum vote count threshold.
 */
import { logger } from '../../../lib/logger.js';
import { getTmdbClient } from '../tmdb/index.js';

import type { CandidateMovie, RotationSourceAdapter } from './source-types.js';

const DEFAULT_PAGES = 5;
const MAX_PAGES = 25;
const MIN_VOTE_COUNT = 500;

export const tmdbTopRatedSource: RotationSourceAdapter = {
  type: 'tmdb_top_rated',

  async fetchCandidates(config: Record<string, unknown>): Promise<CandidateMovie[]> {
    const pages = Math.min(
      Math.max(1, typeof config.pages === 'number' ? config.pages : DEFAULT_PAGES),
      MAX_PAGES
    );

    let client;
    try {
      client = getTmdbClient();
    } catch {
      logger.warn('[tmdb_top_rated] TMDB API key not configured — skipping');
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
        logger.warn(
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

    logger.info(`[tmdb_top_rated] Fetched ${candidates.length} candidates from ${pages} page(s)`);
    return candidates;
  },
};
