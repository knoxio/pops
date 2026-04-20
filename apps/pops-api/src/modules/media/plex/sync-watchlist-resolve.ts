import { getDb } from '../../../db.js';
import * as tvShowService from '../library/tv-show-service.js';
import { createMovie, getMovieByTmdbId } from '../movies/service.js';
import { getTvdbClient } from '../thetvdb/index.js';
import { getTmdbClient } from '../tmdb/index.js';
import { getTvShowByTvdbId } from '../tv-shows/service.js';
import { extractExternalIdAsNumber } from './sync-helpers.js';
import { searchTmdbByTitleYear, searchTvdbByTitle } from './sync-watchlist-search.js';

import type { PlexMediaItem } from './types.js';

export interface ResolvedMedia {
  mediaType: 'movie' | 'tv_show';
  mediaId: number;
}

export interface ResolveResult {
  resolved: ResolvedMedia | null;
  skipReason: string | null;
}

async function resolveMovie(item: PlexMediaItem): Promise<ResolveResult> {
  let tmdbId = extractExternalIdAsNumber(item, 'tmdb');
  if (!tmdbId) {
    tmdbId = await searchTmdbByTitleYear(item.title, item.year);
    if (!tmdbId) {
      return {
        resolved: null,
        skipReason: 'No TMDB ID in Plex metadata and title search found no match',
      };
    }
  }

  let movie = getMovieByTmdbId(tmdbId);
  if (!movie) {
    try {
      const tmdbClient = getTmdbClient();
      const detail = await tmdbClient.getMovie(tmdbId);
      getDb().transaction(() => {
        createMovie({
          tmdbId: detail.tmdbId,
          imdbId: detail.imdbId,
          title: detail.title,
          originalTitle: detail.originalTitle,
          overview: detail.overview,
          tagline: detail.tagline,
          releaseDate: detail.releaseDate,
          runtime: detail.runtime,
          status: detail.status,
          originalLanguage: detail.originalLanguage,
          budget: detail.budget,
          revenue: detail.revenue,
          posterPath: detail.posterPath,
          backdropPath: detail.backdropPath,
          voteAverage: detail.voteAverage,
          voteCount: detail.voteCount,
          genres: detail.genres.map((g) => g.name),
        });
      })();
      movie = getMovieByTmdbId(tmdbId);
    } catch {
      return { resolved: null, skipReason: 'Failed to fetch movie from TMDB' };
    }
  }

  if (!movie) return { resolved: null, skipReason: 'Failed to create movie record' };
  return { resolved: { mediaType: 'movie', mediaId: movie.id }, skipReason: null };
}

async function resolveTvShow(item: PlexMediaItem): Promise<ResolveResult> {
  let tvdbId = extractExternalIdAsNumber(item, 'tvdb');
  if (!tvdbId) {
    tvdbId = await searchTvdbByTitle(item.title, item.year);
    if (!tvdbId) {
      return {
        resolved: null,
        skipReason: 'No TVDB ID in Plex metadata and title search found no match',
      };
    }
  }

  let show = getTvShowByTvdbId(tvdbId);
  if (!show) {
    try {
      const tvdbClient = getTvdbClient();
      await tvShowService.addTvShow(tvdbId, tvdbClient);
      show = getTvShowByTvdbId(tvdbId);
    } catch {
      return { resolved: null, skipReason: 'Failed to fetch TV show from TVDB' };
    }
  }

  if (!show) return { resolved: null, skipReason: 'Failed to create TV show record' };
  return { resolved: { mediaType: 'tv_show', mediaId: show.id }, skipReason: null };
}

/**
 * Resolve a Plex watchlist item to a local media record.
 * Ensures the item exists in the POPS library (adds if missing).
 */
export async function resolveMediaItem(item: PlexMediaItem): Promise<ResolveResult> {
  if (item.type === 'movie') return resolveMovie(item);
  if (item.type === 'show') return resolveTvShow(item);
  return { resolved: null, skipReason: `Unsupported media type: ${item.type}` };
}
