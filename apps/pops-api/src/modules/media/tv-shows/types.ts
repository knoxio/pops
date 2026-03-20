import { z } from "zod";
import type { TvShowRow, SeasonRow, EpisodeRow } from "@pops/db-types";

export type { TvShowRow, SeasonRow, EpisodeRow };

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
  backdropPath: string | null;
  logoPath: string | null;
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
    backdropPath: row.backdropPath,
    logoPath: row.logoPath,
    posterOverridePath: row.posterOverridePath,
    voteAverage: row.voteAverage,
    voteCount: row.voteCount,
    genres: parseJsonArray(row.genres),
    networks: parseJsonArray(row.networks),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
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

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

// --- Zod schemas ---

export const CreateTvShowSchema = z.object({
  tvdbId: z.number().int().positive(),
  name: z.string().min(1, "Name is required"),
  originalName: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  firstAirDate: z.string().nullable().optional(),
  lastAirDate: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  numberOfSeasons: z.number().int().nullable().optional(),
  numberOfEpisodes: z.number().int().nullable().optional(),
  episodeRunTime: z.number().int().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  posterOverridePath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  voteCount: z.number().int().nullable().optional(),
  genres: z.array(z.string()).optional(),
  networks: z.array(z.string()).optional(),
});
export type CreateTvShowInput = z.infer<typeof CreateTvShowSchema>;

export const UpdateTvShowSchema = z.object({
  name: z.string().min(1).optional(),
  originalName: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  firstAirDate: z.string().nullable().optional(),
  lastAirDate: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  numberOfSeasons: z.number().int().nullable().optional(),
  numberOfEpisodes: z.number().int().nullable().optional(),
  episodeRunTime: z.number().int().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  posterOverridePath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  voteCount: z.number().int().nullable().optional(),
  genres: z.array(z.string()).optional(),
  networks: z.array(z.string()).optional(),
});
export type UpdateTvShowInput = z.infer<typeof UpdateTvShowSchema>;

export const TvShowQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().positive().optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type TvShowQuery = z.infer<typeof TvShowQuerySchema>;

export const CreateSeasonSchema = z.object({
  tvShowId: z.number().int().positive(),
  tvdbId: z.number().int().positive(),
  seasonNumber: z.number().int().nonnegative(),
  name: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  airDate: z.string().nullable().optional(),
  episodeCount: z.number().int().nullable().optional(),
});
export type CreateSeasonInput = z.infer<typeof CreateSeasonSchema>;

export const CreateEpisodeSchema = z.object({
  seasonId: z.number().int().positive(),
  tvdbId: z.number().int().positive(),
  episodeNumber: z.number().int().nonnegative(),
  name: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  airDate: z.string().nullable().optional(),
  stillPath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  runtime: z.number().int().nullable().optional(),
});
export type CreateEpisodeInput = z.infer<typeof CreateEpisodeSchema>;
