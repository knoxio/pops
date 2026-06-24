/**
 * Movie wire-shape mapper for the media pillar REST surface.
 *
 * The computed `posterUrl`/`backdropUrl`/`logoUrl` point back at the
 * `/media/images` Express byte route the pillar also mounts; `genres` is
 * parsed from the JSON-encoded column with an empty-array fallback.
 */
import type { MovieRow } from '../../db/index.js';

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
  rotationStatus: 'leaving' | 'protected' | null;
  rotationExpiresAt: string | null;
}

function parseGenres(raw: string | null): string[] {
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

/** Map a SQLite row to the API response shape. */
export function toMovie(row: MovieRow): Movie {
  let posterUrl: string | null = null;
  if (row.posterOverridePath) {
    posterUrl = row.posterOverridePath;
  } else if (row.posterPath) {
    posterUrl = `/media/images/movie/${row.tmdbId}/poster.jpg`;
  }

  const backdropUrl = row.backdropPath ? `/media/images/movie/${row.tmdbId}/backdrop.jpg` : null;
  const logoUrl = row.logoPath ? `/media/images/movie/${row.tmdbId}/logo.png` : null;

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
    genres: parseGenres(row.genres),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    rotationStatus: row.rotationStatus ?? null,
    rotationExpiresAt: row.rotationExpiresAt ?? null,
  };
}
