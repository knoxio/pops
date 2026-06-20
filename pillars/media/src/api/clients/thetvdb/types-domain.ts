/** TheTVDB v4 domain types and error class. */

/** Typed error for TheTVDB API failures. */
export class TvdbApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'TvdbApiError';
  }
}

/** A single search result from TheTVDB. */
export interface TvdbSearchResult {
  tvdbId: number;
  name: string;
  originalName: string | null;
  overview: string | null;
  firstAirDate: string | null;
  status: string | null;
  posterPath: string | null;
  genres: string[];
  originalLanguage: string | null;
  year: string | null;
}

/** Summary of a season within a show detail response. */
export interface TvdbSeasonSummary {
  tvdbId: number;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  imageUrl: string | null;
  episodeCount: number;
}

/** Artwork entry from TheTVDB. */
export interface TvdbArtwork {
  id: number;
  type: number;
  imageUrl: string;
  language: string | null;
  score: number;
}

/** Full show detail from TheTVDB extended endpoint. */
export interface TvdbShowDetail {
  tvdbId: number;
  name: string;
  originalName: string | null;
  overview: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  status: string | null;
  originalLanguage: string | null;
  averageRuntime: number | null;
  genres: { id: number; name: string }[];
  networks: { id: number; name: string }[];
  seasons: TvdbSeasonSummary[];
  artworks: TvdbArtwork[];
}

/** A single episode from TheTVDB. */
export interface TvdbEpisode {
  tvdbId: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  runtime: number | null;
  imageUrl: string | null;
}
