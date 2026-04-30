/** Mapping functions: Raw TheTVDB API → Domain. */
import { stripSurroundingQuotes } from '../lib/strip-surrounding-quotes.js';

import type {
  TvdbArtwork,
  TvdbEpisode,
  TvdbSearchResult,
  TvdbSeasonSummary,
  TvdbShowDetail,
} from './types-domain.js';
import type {
  RawTvdbArtwork,
  RawTvdbEpisode,
  RawTvdbSearchResult,
  RawTvdbSeasonSummary,
  RawTvdbSeriesExtended,
} from './types-raw.js';

const ARTWORK_TYPE_POSTER = 2;
const ARTWORK_TYPE_BACKDROP = 3;

function pickFirst<T>(...values: Array<T | null | undefined>): T | null {
  for (const v of values) {
    if (v != null) return v;
  }
  return null;
}

/** Map a raw search result to a clean domain object. */
export function mapSearchResult(raw: RawTvdbSearchResult): TvdbSearchResult {
  return {
    tvdbId: Number(pickFirst(raw.tvdb_id, raw.objectID) ?? 0),
    name: stripSurroundingQuotes(raw.name),
    originalName: raw.name_translated?.eng ? stripSurroundingQuotes(raw.name_translated.eng) : null,
    overview: pickFirst(raw.overview, raw.overviews?.eng),
    firstAirDate: raw.first_air_time ?? null,
    status: raw.status ?? null,
    posterPath: pickFirst(raw.image_url, raw.thumbnail),
    genres: raw.genres ?? [],
    originalLanguage: raw.primary_language ?? null,
    year: raw.year ?? null,
  };
}

function mapSeasonSummary(s: RawTvdbSeasonSummary): TvdbSeasonSummary {
  return {
    tvdbId: s.id,
    seasonNumber: s.number,
    name: s.name ?? null,
    overview: s.overview ?? null,
    imageUrl: s.image ?? null,
    episodeCount: Array.isArray(s.episodes) ? s.episodes.length : 0,
  };
}

function mapArtwork(a: RawTvdbArtwork): TvdbArtwork {
  return {
    id: a.id,
    type: a.type,
    imageUrl: a.image,
    language: a.language,
    score: a.score,
  };
}

function isDefaultOrOfficialSeason(s: RawTvdbSeasonSummary): boolean {
  return !s.type || s.type.type === 'default' || s.type.type === 'official';
}

interface ShowDetailScalars {
  originalName: string | null;
  overview: string | null;
  firstAirDate: string | null;
  lastAirDate: string | null;
  status: string | null;
  originalLanguage: string | null;
  averageRuntime: number | null;
}

function mapShowDetailScalars(raw: RawTvdbSeriesExtended): ShowDetailScalars {
  return {
    originalName: raw.originalName ? stripSurroundingQuotes(raw.originalName) : null,
    overview: raw.overview ?? null,
    firstAirDate: raw.firstAired ?? null,
    lastAirDate: raw.lastAired ?? null,
    status: raw.status?.name ?? null,
    originalLanguage: raw.originalLanguage ?? null,
    averageRuntime: raw.averageRuntime ?? null,
  };
}

/** Map a raw extended series response to a clean domain object. */
export function mapShowDetail(raw: RawTvdbSeriesExtended): TvdbShowDetail {
  const rawSeasons = (raw.seasons ?? []).filter(isDefaultOrOfficialSeason);
  return {
    tvdbId: raw.id,
    name: stripSurroundingQuotes(raw.name),
    ...mapShowDetailScalars(raw),
    genres: (raw.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
    networks: (raw.networks ?? []).map((n) => ({ id: n.id, name: n.name })),
    seasons: rawSeasons.map(mapSeasonSummary),
    artworks: (raw.artworks ?? []).map(mapArtwork),
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

function pickBestArtwork(artworks: TvdbArtwork[], type: number): string | null {
  const candidates = artworks.filter((a) => a.type === type);
  if (candidates.length === 0) return null;
  const sorted = [...candidates].toSorted((a, b) => {
    const aEng = a.language === 'eng' ? 1 : 0;
    const bEng = b.language === 'eng' ? 1 : 0;
    if (aEng !== bEng) return bEng - aEng;
    return b.score - a.score;
  });
  return sorted[0]?.imageUrl ?? null;
}

/**
 * Select the best poster and backdrop URLs from an artwork array.
 * Prefers English-language artwork with the highest score.
 */
export function mapArtworks(artworks: TvdbArtwork[]): {
  posterUrl: string | null;
  backdropUrl: string | null;
} {
  return {
    posterUrl: pickBestArtwork(artworks, ARTWORK_TYPE_POSTER),
    backdropUrl: pickBestArtwork(artworks, ARTWORK_TYPE_BACKDROP),
  };
}

export function extractGenreNames(genres: { id: number; name: string }[]): string[] {
  return genres.map((g) => g.name);
}

export function extractNetworkNames(networks: { id: number; name: string }[]): string[] {
  return networks.map((n) => n.name);
}
