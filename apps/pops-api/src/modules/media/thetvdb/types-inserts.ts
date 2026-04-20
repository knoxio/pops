import { extractGenreNames, extractNetworkNames, mapArtworks } from './types-mappers.js';

/** Drizzle insert value builders for TheTVDB → POPS DB. */
import type { EpisodeInsert, SeasonInsert, TvShowInsert } from '@pops/db-types';

import type { TvdbEpisode, TvdbSeasonSummary, TvdbShowDetail } from './types-domain.js';

/** Convert a TvdbShowDetail to a Drizzle insert value for tv_shows. */
export function toTvShowInsert(detail: TvdbShowDetail): TvShowInsert {
  const { posterUrl, backdropUrl } = mapArtworks(detail.artworks);
  return {
    tvdbId: detail.tvdbId,
    name: detail.name,
    originalName: detail.originalName,
    overview: detail.overview,
    firstAirDate: detail.firstAirDate,
    lastAirDate: detail.lastAirDate,
    status: detail.status,
    originalLanguage: detail.originalLanguage,
    numberOfSeasons: detail.seasons.length || null,
    numberOfEpisodes: null,
    episodeRunTime: detail.averageRuntime,
    posterPath: posterUrl,
    backdropPath: backdropUrl,
    logoPath: null,
    voteAverage: null,
    voteCount: null,
    genres: JSON.stringify(extractGenreNames(detail.genres)),
    networks: JSON.stringify(extractNetworkNames(detail.networks)),
  };
}

export function toSeasonInsert(season: TvdbSeasonSummary, tvShowId: number): SeasonInsert {
  return {
    tvShowId,
    tvdbId: season.tvdbId,
    seasonNumber: season.seasonNumber,
    name: season.name,
    overview: season.overview,
    posterPath: season.imageUrl,
    airDate: null,
    episodeCount: season.episodeCount || null,
  };
}

export function toEpisodeInsert(episode: TvdbEpisode, seasonId: number): EpisodeInsert {
  return {
    seasonId,
    tvdbId: episode.tvdbId,
    episodeNumber: episode.episodeNumber,
    name: episode.name,
    overview: episode.overview,
    airDate: episode.airDate,
    stillPath: episode.imageUrl,
    voteAverage: null,
    runtime: episode.runtime,
  };
}
