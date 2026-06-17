/**
 * Library wire-shape mapper for the media pillar.
 *
 * Lifted from the monolith `library/list-service.ts` `rowToLibraryItem`.
 * Movie/TV posters point at the pillar's `/media/images/...` byte route;
 * `cdnPosterUrl` is a direct TMDB CDN URL (movies only, no override) the FE
 * uses for faster first paint.
 */
import type { LibraryRawRow } from '../../db/index.js';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

export interface LibraryItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  year: number | null;
  posterUrl: string | null;
  cdnPosterUrl: string | null;
  genres: string[];
  voteAverage: number | null;
  createdAt: string;
  releaseDate: string | null;
}

function parseGenres(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((g): g is string => typeof g === 'string') : [];
  } catch {
    return [];
  }
}

function posterUrl(row: LibraryRawRow): string | null {
  if (row.poster_override_path) return row.poster_override_path;
  if (!row.poster_path) return null;
  const kind = row.type === 'movie' ? 'movie' : 'tv';
  return `/media/images/${kind}/${row.external_id}/poster.jpg`;
}

function cdnPosterUrl(row: LibraryRawRow): string | null {
  if (row.poster_override_path) return null;
  if (row.type === 'movie' && row.poster_path) return `${TMDB_IMAGE_BASE}${row.poster_path}`;
  return null;
}

export function toLibraryItem(row: LibraryRawRow): LibraryItem {
  return {
    id: row.id,
    type: row.type === 'movie' ? 'movie' : 'tv',
    title: row.title,
    year: row.release_date ? new Date(row.release_date).getFullYear() : null,
    posterUrl: posterUrl(row),
    cdnPosterUrl: cdnPosterUrl(row),
    genres: parseGenres(row.genres),
    voteAverage: row.vote_average,
    createdAt: row.created_at,
    releaseDate: row.release_date,
  };
}
