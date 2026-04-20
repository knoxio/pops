import type { EpisodeRow, SeasonRow, TvShowRow } from '@pops/db-types';

import type { Episode, Season, TvShow } from './types-domain.js';

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function tvShowPosterUrl(row: TvShowRow): string | null {
  if (row.posterOverridePath) return row.posterOverridePath;
  if (row.posterPath) return `/media/images/tv/${row.tvdbId}/poster.jpg`;
  return null;
}

function tvShowBackdropUrl(row: TvShowRow): string | null {
  if (row.backdropPath) return `/media/images/tv/${row.tvdbId}/backdrop.jpg`;
  return null;
}

function tvShowLogoUrl(row: TvShowRow): string | null {
  if (row.logoPath) return `/media/images/tv/${row.tvdbId}/logo.png`;
  return null;
}

/** Map a SQLite row to the API response shape. */
export function toTvShow(row: TvShowRow): TvShow {
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
    posterUrl: tvShowPosterUrl(row),
    backdropPath: row.backdropPath,
    backdropUrl: tvShowBackdropUrl(row),
    logoPath: row.logoPath,
    logoUrl: tvShowLogoUrl(row),
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
  if (row.posterPath.startsWith('/')) {
    return `https://image.tmdb.org/t/p/w600_and_h900_bestv2${row.posterPath}`;
  }
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
