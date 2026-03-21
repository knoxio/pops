import { z } from "zod";
import type { MovieRow } from "@pops/db-types";

export type { MovieRow };

/** API response shape for a movie. */
export interface Movie {
  id: number;
  tmdbId: number;
  imdbId: string | null;
  title: string;
  originalTitle: string | null;
  overview: string | null;
  tagline: string | null;
  releaseDate: string | null;
  runtime: number | null;
  status: string | null;
  originalLanguage: string | null;
  budget: number | null;
  revenue: number | null;
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
  createdAt: string;
  updatedAt: string;
}

/** Map a SQLite row to the API response shape. */
export function toMovie(row: MovieRow): Movie {
  // Determine the best URLs:
  // 1. User override (local upload)
  // 2. Local cache (downloaded from TMDB)
  // 3. TMDB CDN fallback
  // 4. Null (placeholder in UI)

  let posterUrl: string | null = null;
  if (row.posterOverridePath) {
    posterUrl = row.posterOverridePath;
  } else if (row.posterPath) {
    // Try local cache first (express route handles the file serving)
    posterUrl = `/media/images/movie/${row.tmdbId}/poster.jpg`;
  }

  let backdropUrl: string | null = null;
  if (row.backdropPath) {
    backdropUrl = `/media/images/movie/${row.tmdbId}/backdrop.jpg`;
  }

  let logoUrl: string | null = null;
  if (row.logoPath) {
    logoUrl = `/media/images/movie/${row.tmdbId}/logo.png`;
  }

  return {
    id: row.id,
    tmdbId: row.tmdbId,
    imdbId: row.imdbId,
    title: row.title,
    originalTitle: row.originalTitle,
    overview: row.overview,
    tagline: row.tagline,
    releaseDate: row.releaseDate,
    runtime: row.runtime,
    status: row.status,
    originalLanguage: row.originalLanguage,
    budget: row.budget,
    revenue: row.revenue,
    posterPath: row.posterPath,
    posterUrl,
    backdropPath: row.backdropPath,
    backdropUrl,
    logoPath: row.logoPath,
    logoUrl,
    posterOverridePath: row.posterOverridePath,
    voteAverage: row.voteAverage,
    voteCount: row.voteCount,
    genres: row.genres
      ? (() => {
          try {
            const parsed = JSON.parse(row.genres) as unknown;
            if (Array.isArray(parsed)) {
              return parsed.filter((item): item is string => typeof item === "string");
            }
            return [];
          } catch {
            return [];
          }
        })()
      : [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Zod schema for creating a movie. */
export const CreateMovieSchema = z.object({
  tmdbId: z.number().int().positive(),
  imdbId: z.string().nullable().optional(),
  title: z.string().min(1, "Title is required"),
  originalTitle: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  runtime: z.number().int().positive().nullable().optional(),
  status: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  budget: z.number().int().nonnegative().nullable().optional(),
  revenue: z.number().int().nonnegative().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  posterOverridePath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  voteCount: z.number().int().nonnegative().nullable().optional(),
  genres: z.array(z.string()).optional().default([]),
});
export type CreateMovieInput = z.infer<typeof CreateMovieSchema>;

/** Zod schema for updating a movie (all fields optional). */
export const UpdateMovieSchema = z.object({
  tmdbId: z.number().int().positive().optional(),
  imdbId: z.string().nullable().optional(),
  title: z.string().min(1, "Title cannot be empty").optional(),
  originalTitle: z.string().nullable().optional(),
  overview: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  runtime: z.number().int().positive().nullable().optional(),
  status: z.string().nullable().optional(),
  originalLanguage: z.string().nullable().optional(),
  budget: z.number().int().nonnegative().nullable().optional(),
  revenue: z.number().int().nonnegative().nullable().optional(),
  posterPath: z.string().nullable().optional(),
  backdropPath: z.string().nullable().optional(),
  logoPath: z.string().nullable().optional(),
  posterOverridePath: z.string().nullable().optional(),
  voteAverage: z.number().nullable().optional(),
  voteCount: z.number().int().nonnegative().nullable().optional(),
  genres: z.array(z.string()).optional(),
});
export type UpdateMovieInput = z.infer<typeof UpdateMovieSchema>;

/** Zod schema for movie list query params. */
export const MovieQuerySchema = z.object({
  search: z.string().optional(),
  genre: z.string().optional(),
  limit: z.coerce.number().positive().max(500).optional(),
  offset: z.coerce.number().nonnegative().optional(),
});
export type MovieQueryRaw = z.infer<typeof MovieQuerySchema>;

/** Parsed filter params passed to the service layer. */
export interface MovieFilters {
  search?: string;
  genre?: string;
}
