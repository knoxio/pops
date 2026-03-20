/**
 * TheTVDB v4 API response types, mapping functions, and Drizzle insert builders.
 */
import type { TvShowInsert, SeasonInsert, EpisodeInsert } from "@pops/db-types";

/** Typed error for TheTVDB API failures. */
export class TvdbApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "TvdbApiError";
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

// --- Raw API shapes (TheTVDB v4 responses) ---

/** Raw TheTVDB search result. */
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

/** Raw TheTVDB search response wrapper. */
export interface RawTvdbSearchResponse {
  status: string;
  data: RawTvdbSearchResult[];
}

/** Raw TheTVDB artwork. */
export interface RawTvdbArtwork {
  id: number;
  type: number;
  image: string;
  language: string | null;
  score: number;
}

/** Raw TheTVDB season summary within extended series. */
export interface RawTvdbSeasonSummary {
  id: number;
  number: number;
  name?: string | null;
  overview?: string | null;
  image?: string | null;
  type?: { id: number; name: string; type: string } | null;
  episodes?: unknown[] | null;
}

/** Raw TheTVDB genre/network. */
export interface RawTvdbGenre {
  id: number;
  name: string;
}

/** Raw TheTVDB extended series response. */
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

/** Raw TheTVDB extended series response wrapper. */
export interface RawTvdbSeriesExtendedResponse {
  status: string;
  data: RawTvdbSeriesExtended;
}

/** Raw TheTVDB episode. */
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

/** Raw TheTVDB episodes response wrapper. */
export interface RawTvdbEpisodesResponse {
  status: string;
  data: {
    series: { id: number };
    episodes: RawTvdbEpisode[];
  };
}

/** Login response from TheTVDB. */
export interface RawTvdbLoginResponse {
  status: string;
  data: {
    token: string;
  };
}

// ---------------------------------------------------------------------------
// Mapping functions: Raw API → Domain
// ---------------------------------------------------------------------------

const ARTWORK_TYPE_POSTER = 2;
const ARTWORK_TYPE_BACKDROP = 3;

/** Map a raw search result to a clean domain object. */
export function mapSearchResult(raw: RawTvdbSearchResult): TvdbSearchResult {
  return {
    tvdbId: Number(raw.tvdb_id ?? raw.objectID ?? 0),
    name: raw.name,
    originalName: raw.name_translated?.eng ?? null,
    overview: raw.overview ?? raw.overviews?.eng ?? null,
    firstAirDate: raw.first_air_time ?? null,
    status: raw.status ?? null,
    posterPath: raw.image_url ?? raw.thumbnail ?? null,
    genres: raw.genres ?? [],
    originalLanguage: raw.primary_language ?? null,
    year: raw.year ?? null,
  };
}

/** Map a raw extended series response to a clean domain object. */
export function mapShowDetail(raw: RawTvdbSeriesExtended): TvdbShowDetail {
  // Filter to default/official broadcast order only
  const rawSeasons = (raw.seasons ?? []).filter(
    (s) => !s.type || s.type.type === "default" || s.type.type === "official",
  );

  return {
    tvdbId: raw.id,
    name: raw.name,
    originalName: raw.originalName ?? null,
    overview: raw.overview ?? null,
    firstAirDate: raw.firstAired ?? null,
    lastAirDate: raw.lastAired ?? null,
    status: raw.status?.name ?? null,
    originalLanguage: raw.originalLanguage ?? null,
    averageRuntime: raw.averageRuntime ?? null,
    genres: (raw.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
    networks: (raw.networks ?? []).map((n) => ({ id: n.id, name: n.name })),
    seasons: rawSeasons.map((s) => ({
      tvdbId: s.id,
      seasonNumber: s.number,
      name: s.name ?? null,
      overview: s.overview ?? null,
      imageUrl: s.image ?? null,
      episodeCount: Array.isArray(s.episodes) ? s.episodes.length : 0,
    })),
    artworks: (raw.artworks ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      imageUrl: a.image,
      language: a.language,
      score: a.score,
    })),
  };
}

/** Map a raw episode to a clean domain object. */
export function mapEpisode(raw: RawTvdbEpisode): TvdbEpisode {
  return {
    tvdbId: raw.id,
    episodeNumber: raw.number,
    seasonNumber: raw.seasonNumber,
    name: raw.name ?? null,
    overview: raw.overview ?? null,
    airDate: raw.aired ?? null,
    runtime: raw.runtime ?? null,
    imageUrl: raw.image ?? null,
  };
}

/**
 * Select the best poster and backdrop URLs from an artwork array.
 * Prefers English-language artwork with the highest score.
 */
export function mapArtworks(
  artworks: TvdbArtwork[],
): { posterUrl: string | null; backdropUrl: string | null } {
  return {
    posterUrl: pickBestArtwork(artworks, ARTWORK_TYPE_POSTER),
    backdropUrl: pickBestArtwork(artworks, ARTWORK_TYPE_BACKDROP),
  };
}

function pickBestArtwork(
  artworks: TvdbArtwork[],
  type: number,
): string | null {
  const candidates = artworks.filter((a) => a.type === type);
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    const aEng = a.language === "eng" ? 1 : 0;
    const bEng = b.language === "eng" ? 1 : 0;
    if (aEng !== bEng) return bEng - aEng;
    return b.score - a.score;
  });

  return sorted[0].imageUrl;
}

// ---------------------------------------------------------------------------
// Genre & network extraction helpers
// ---------------------------------------------------------------------------

/** Extract genre names to a string array. */
export function extractGenreNames(
  genres: { id: number; name: string }[],
): string[] {
  return genres.map((g) => g.name);
}

/** Extract network names to a string array. */
export function extractNetworkNames(
  networks: { id: number; name: string }[],
): string[] {
  return networks.map((n) => n.name);
}

// ---------------------------------------------------------------------------
// Drizzle insert value builders
// ---------------------------------------------------------------------------

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
    numberOfEpisodes: null, // populated after episode fetch
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

/** Convert a TvdbSeasonSummary to a Drizzle insert value for seasons. */
export function toSeasonInsert(
  season: TvdbSeasonSummary,
  tvShowId: number,
): SeasonInsert {
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

/** Convert a TvdbEpisode to a Drizzle insert value for episodes. */
export function toEpisodeInsert(
  episode: TvdbEpisode,
  seasonId: number,
): EpisodeInsert {
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
