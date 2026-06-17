/** Raw TheTVDB v4 API response shapes. */

export interface RawTvdbSearchResult {
  tvdb_id?: string;
  objectID?: string;
  name: string;
  name_translated?: Record<string, string> | null;
  aliases?: string[];
  overview?: string | null;
  overviews?: Record<string, string> | null;
  first_air_time?: string | null;
  status?: string | null;
  image_url?: string | null;
  thumbnail?: string | null;
  genres?: string[];
  primary_language?: string | null;
  year?: string | null;
}

export interface RawTvdbSearchResponse {
  status: string;
  data: RawTvdbSearchResult[];
}

export interface RawTvdbArtwork {
  id: number;
  type: number;
  image: string;
  language: string | null;
  score: number;
}

export interface RawTvdbSeasonSummary {
  id: number;
  number: number;
  name?: string | null;
  overview?: string | null;
  image?: string | null;
  type?: { id: number; name: string; type: string } | null;
  episodes?: unknown[] | null;
}

export interface RawTvdbGenre {
  id: number;
  name: string;
}

export interface RawTvdbSeriesExtended {
  id: number;
  name: string;
  originalName?: string | null;
  overview?: string | null;
  firstAired?: string | null;
  lastAired?: string | null;
  status?: { id: number; name: string } | null;
  originalLanguage?: string | null;
  averageRuntime?: number | null;
  genres?: RawTvdbGenre[];
  networks?: RawTvdbGenre[];
  seasons?: RawTvdbSeasonSummary[];
  artworks?: RawTvdbArtwork[];
}

export interface RawTvdbSeriesExtendedResponse {
  status: string;
  data: RawTvdbSeriesExtended;
}

export interface RawTvdbEpisode {
  id: number;
  number: number;
  seasonNumber: number;
  name?: string | null;
  overview?: string | null;
  aired?: string | null;
  runtime?: number | null;
  image?: string | null;
}

export interface RawTvdbEpisodesResponse {
  status: string;
  data: {
    series: { id: number };
    episodes: RawTvdbEpisode[];
  };
}

export interface RawTvdbLoginResponse {
  status: string;
  data: {
    token: string;
  };
}
