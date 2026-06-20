/**
 * Resolve a Plex watchlist item to a local media record, importing it into
 * the library when missing.
 *
 * Ported from the monolith `sync-watchlist-resolve.ts`, converted to the
 * pillar's `(db, …)` services with injected clients.
 */
import { type MediaDb, moviesService, tvShowsService } from '../../../../db/index.js';
import { addTvShow } from '../../../modules/tv-ingest.js';
import { extractExternalIdAsNumber } from './sync-helpers.js';
import { searchTmdbByTitleYear, searchTvdbByTitle } from './sync-watchlist-search.js';

import type { TheTvdbClient } from '../../thetvdb/client.js';
import type { TmdbClient } from '../../tmdb/client.js';
import type { ImageCacheService } from '../../tmdb/image-cache.js';
import type { PlexMediaItem } from '../types.js';

export interface ResolvedMedia {
  mediaType: 'movie' | 'tv_show';
  mediaId: number;
}

export interface ResolveResult {
  resolved: ResolvedMedia | null;
  skipReason: string | null;
}

export interface ResolveDeps {
  db: MediaDb;
  tmdbClient: TmdbClient;
  tvdbClient: TheTvdbClient;
  imageCache: ImageCacheService;
}

async function resolveMovie(deps: ResolveDeps, item: PlexMediaItem): Promise<ResolveResult> {
  const { db, tmdbClient } = deps;
  let tmdbId = extractExternalIdAsNumber(item, 'tmdb');
  if (!tmdbId) {
    tmdbId = await searchTmdbByTitleYear(tmdbClient, item.title, item.year);
    if (!tmdbId) {
      return {
        resolved: null,
        skipReason: 'No TMDB ID in Plex metadata and title search found no match',
      };
    }
  }

  let movie = moviesService.getMovieByTmdbId(db, tmdbId);
  if (!movie) {
    try {
      const detail = await tmdbClient.getMovie(tmdbId);
      moviesService.createMovie(db, {
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
      movie = moviesService.getMovieByTmdbId(db, tmdbId);
    } catch {
      return { resolved: null, skipReason: 'Failed to fetch movie from TMDB' };
    }
  }

  if (!movie) return { resolved: null, skipReason: 'Failed to create movie record' };
  return { resolved: { mediaType: 'movie', mediaId: movie.id }, skipReason: null };
}

async function resolveTvShow(deps: ResolveDeps, item: PlexMediaItem): Promise<ResolveResult> {
  const { db, tvdbClient, imageCache } = deps;
  let tvdbId = extractExternalIdAsNumber(item, 'tvdb');
  if (!tvdbId) {
    tvdbId = await searchTvdbByTitle(tvdbClient, item.title, item.year);
    if (!tvdbId) {
      return {
        resolved: null,
        skipReason: 'No TVDB ID in Plex metadata and title search found no match',
      };
    }
  }

  let show = tvShowsService.getTvShowByTvdbId(db, tvdbId);
  if (!show) {
    try {
      await addTvShow(db, tvdbId, tvdbClient, imageCache);
      show = tvShowsService.getTvShowByTvdbId(db, tvdbId);
    } catch {
      return { resolved: null, skipReason: 'Failed to fetch TV show from TVDB' };
    }
  }

  if (!show) return { resolved: null, skipReason: 'Failed to create TV show record' };
  return { resolved: { mediaType: 'tv_show', mediaId: show.id }, skipReason: null };
}

/** Resolve a Plex watchlist item to a local media record (adds if missing). */
export async function resolveMediaItem(
  deps: ResolveDeps,
  item: PlexMediaItem
): Promise<ResolveResult> {
  if (item.type === 'movie') return resolveMovie(deps, item);
  if (item.type === 'show') return resolveTvShow(deps, item);
  return { resolved: null, skipReason: `Unsupported media type: ${item.type}` };
}
