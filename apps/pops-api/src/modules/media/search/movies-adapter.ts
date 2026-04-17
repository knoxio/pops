import { like } from 'drizzle-orm';

/**
 * Movies search adapter — searches the local movies table by title.
 *
 * Registered domain: "movies"
 * Scoring: exact=1.0, prefix=0.8, contains=0.5
 */
import { movies } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { registerSearchAdapter } from '../../core/search/index.js';

import type { Query, SearchAdapter, SearchContext, SearchHit } from '../../core/search/types.js';

export interface MovieHitData {
  title: string;
  year: string | null;
  posterUrl: string | null;
  status: string | null;
  voteAverage: number | null;
  genres: string[];
}

function scoreHit(
  title: string,
  queryText: string
): { score: number; matchType: 'exact' | 'prefix' | 'contains' } {
  const lower = title.toLowerCase();
  const q = queryText.toLowerCase();

  if (lower === q) return { score: 1.0, matchType: 'exact' };
  if (lower.startsWith(q)) return { score: 0.8, matchType: 'prefix' };
  return { score: 0.5, matchType: 'contains' };
}

function buildPosterUrl(posterPath: string | null): string | null {
  if (!posterPath) return null;
  return `/media/images/movies${posterPath}`;
}

function extractYear(releaseDate: string | null): string | null {
  if (!releaseDate) return null;
  return releaseDate.slice(0, 4) || null;
}

function parseGenres(genres: string | null): string[] {
  if (!genres) return [];
  try {
    const parsed: unknown = JSON.parse(genres);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export const moviesSearchAdapter: SearchAdapter<MovieHitData> = {
  domain: 'movies',
  icon: 'Film',
  color: 'purple',

  search(
    query: Query,
    _context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<MovieHitData>[] {
    const text = query.text.trim();
    if (!text) return [];

    const db = getDrizzle();
    const limit = options?.limit ?? 20;

    const rows = db
      .select()
      .from(movies)
      .where(like(movies.title, `%${text}%`))
      .limit(limit)
      .all();

    return rows
      .map((row) => {
        const { score, matchType } = scoreHit(row.title, text);
        return {
          uri: `pops:media/movie/${row.id}`,
          score,
          matchField: 'title' as const,
          matchType,
          data: {
            title: row.title,
            year: extractYear(row.releaseDate),
            posterUrl: buildPosterUrl(row.posterPath),
            status: row.status,
            voteAverage: row.voteAverage,
            genres: parseGenres(row.genres),
          },
        };
      })
      .toSorted((a, b) => b.score - a.score);
  },
};

registerSearchAdapter(moviesSearchAdapter);
