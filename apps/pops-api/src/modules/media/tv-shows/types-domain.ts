import type { EpisodeRow, SeasonRow, TvShowRow } from '@pops/db-types';

export type { EpisodeRow, SeasonRow, TvShowRow };

/** API response shape for a TV show. */
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

/** API response shape for a season. */
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

/** API response shape for an episode. */
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
