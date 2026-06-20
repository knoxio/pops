/**
 * TV-show / season / episode wire-shape mappers for the media pillar.
 *
 * Lifted verbatim from the legacy `media.tv-shows` tRPC router so the REST
 * cutover is transparent. TV-show poster/backdrop/logo URLs point at the
 * pillar's `/media/images/tv/...` byte route; season posters resolve to the
 * TMDB CDN directly (no local cache). `genres`/`networks` are parsed from
 * their JSON-encoded columns with an empty-array fallback.
 */
import type { EpisodeRow, SeasonRow, TvShowRow } from '../../db/index.js';

export type { EpisodeRow, SeasonRow, TvShowRow };

const TMDB_POSTER_PREFIX = 'https://image.tmdb.org/t/p/w600_and_h900_bestv2';

export interface TvShow {
  id: number;
  tvdbId: number;
  name: string;
  originalName: string | null;
  overview: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  status: string | null;
  originalLanguage: string | null;
  numberOfSeasons: number | null;
  numberOfEpisodes: number | null;
  episodeRunTime: number | null;
  posterPath: string | null;
  posterUrl: string | null;
  backdropPath: string | null;
  backdropUrl: string | null;
  logoPath: string | null;
  logoUrl: string | null;
  posterOverridePath: string | null;
  voteAverage: number | null;
  voteCount: number | null;
  genres: string[];
  networks: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: number;
  tvShowId: number;
  tvdbId: number;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  posterPath: string | null;
  posterUrl: string | null;
  airDate: string | null;
  episodeCount: number | null;
  createdAt: string;
}

export interface Episode {
  id: number;
  seasonId: number;
  tvdbId: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  stillPath: string | null;
  voteAverage: number | null;
  runtime: number | null;
  createdAt: string;
}

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

export function toTvShow(row: TvShowRow): TvShow {
  let posterUrl: string | null = null;
  if (row.posterOverridePath) {
    posterUrl = row.posterOverridePath;
  } else if (row.posterPath) {
    posterUrl = `/media/images/tv/${row.tvdbId}/poster.jpg`;
  }

  const backdropUrl = row.backdropPath ? `/media/images/tv/${row.tvdbId}/backdrop.jpg` : null;
  const logoUrl = row.logoPath ? `/media/images/tv/${row.tvdbId}/logo.png` : null;

  return {
    id: row.id,
    tvdbId: row.tvdbId,
    name: row.name,
    originalName: row.originalName,
    overview: row.overview,
    firstAirDate: row.firstAirDate,
    lastAirDate: row.lastAirDate,
    status: row.status,
    originalLanguage: row.originalLanguage,
    numberOfSeasons: row.numberOfSeasons,
    numberOfEpisodes: row.numberOfEpisodes,
    episodeRunTime: row.episodeRunTime,
    posterPath: row.posterPath,
    posterUrl,
    backdropPath: row.backdropPath,
    backdropUrl,
    logoPath: row.logoPath,
    logoUrl,
    posterOverridePath: row.posterOverridePath,
    voteAverage: row.voteAverage,
    voteCount: row.voteCount,
    genres: parseJsonArray(row.genres),
    networks: parseJsonArray(row.networks),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function seasonPosterUrl(row: SeasonRow): string | null {
  if (!row.posterPath) return null;
  if (row.posterPath.startsWith('http')) return row.posterPath;
  if (row.posterPath.startsWith('/')) return `${TMDB_POSTER_PREFIX}${row.posterPath}`;
  return null;
}

export function toSeason(row: SeasonRow): Season {
  return {
    id: row.id,
    tvShowId: row.tvShowId,
    tvdbId: row.tvdbId,
    seasonNumber: row.seasonNumber,
    name: row.name,
    overview: row.overview,
    posterPath: row.posterPath,
    posterUrl: seasonPosterUrl(row),
    airDate: row.airDate,
    episodeCount: row.episodeCount,
    createdAt: row.createdAt,
  };
}

export function toEpisode(row: EpisodeRow): Episode {
  return {
    id: row.id,
    seasonId: row.seasonId,
    tvdbId: row.tvdbId,
    episodeNumber: row.episodeNumber,
    name: row.name,
    overview: row.overview,
    airDate: row.airDate,
    stillPath: row.stillPath,
    voteAverage: row.voteAverage,
    runtime: row.runtime,
    createdAt: row.createdAt,
  };
}
