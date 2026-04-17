import { like } from 'drizzle-orm';

/**
 * TV Shows search adapter — searches the local tv_shows table by name.
 *
 * Registered domain: "tv-shows"
 * Scoring: exact=1.0, prefix=0.8, contains=0.5
 */
import { tvShows } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { registerSearchAdapter } from '../../core/search/index.js';

import type { Query, SearchAdapter, SearchContext, SearchHit } from '../../core/search/types.js';

export interface TvShowHitData {
  name: string;
  year: string | null;
  posterUrl: string | null;
  status: string | null;
  numberOfSeasons: number | null;
  voteAverage: number | null;
}

function scoreHit(
  name: string,
  queryText: string
): { score: number; matchType: 'exact' | 'prefix' | 'contains' } {
  const lower = name.toLowerCase();
  const q = queryText.toLowerCase();

  if (lower === q) return { score: 1.0, matchType: 'exact' };
  if (lower.startsWith(q)) return { score: 0.8, matchType: 'prefix' };
  return { score: 0.5, matchType: 'contains' };
}

function buildPosterUrl(tvdbId: number): string {
  return `/media/images/tv/${tvdbId}/poster.jpg`;
}

function extractYear(firstAirDate: string | null): string | null {
  if (!firstAirDate) return null;
  return firstAirDate.slice(0, 4) || null;
}

export const tvShowsSearchAdapter: SearchAdapter<TvShowHitData> = {
  domain: 'tv-shows',
  icon: 'Tv',
  color: 'purple',

  search(
    query: Query,
    _context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<TvShowHitData>[] {
    const text = query.text.trim();
    if (!text) return [];

    const db = getDrizzle();
    const limit = options?.limit ?? 20;

    const rows = db
      .select()
      .from(tvShows)
      .where(like(tvShows.name, `%${text}%`))
      .limit(limit)
      .all();

    return rows
      .map((row) => {
        const { score, matchType } = scoreHit(row.name, text);
        return {
          uri: `pops:media/tv-show/${row.id}`,
          score,
          matchField: 'name' as const,
          matchType,
          data: {
            name: row.name,
            year: extractYear(row.firstAirDate),
            posterUrl: buildPosterUrl(row.tvdbId),
            status: row.status,
            numberOfSeasons: row.numberOfSeasons,
            voteAverage: row.voteAverage,
          },
        };
      })
      .toSorted((a, b) => b.score - a.score);
  },
};

registerSearchAdapter(tvShowsSearchAdapter);
