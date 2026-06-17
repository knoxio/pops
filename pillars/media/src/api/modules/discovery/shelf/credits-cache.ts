/**
 * In-memory TMDB credits cache + director/lead-cast extraction for the credits
 * shelves. The cache persists for the process lifetime (credits rarely change)
 * so shelf generation + paging don't re-fetch.
 *
 * Ported from the monolith `shelf/credits-shelves.ts` helpers.
 */
import type { TmdbClient, TmdbMovieCredits } from '../../../clients/tmdb/index.js';

export const LEAD_CAST_COUNT = 3;

const creditsCache = new Map<number, TmdbMovieCredits>();

/** Fetch movie credits, memoised per TMDB id. */
export async function getCachedCredits(
  client: TmdbClient,
  tmdbId: number
): Promise<TmdbMovieCredits> {
  const cached = creditsCache.get(tmdbId);
  if (cached) return cached;
  const credits = await client.getMovieCredits(tmdbId);
  creditsCache.set(tmdbId, credits);
  return credits;
}

/** Already-cached credits for a TMDB id (used during synchronous generate). */
export function peekCachedCredits(tmdbId: number): TmdbMovieCredits | undefined {
  return creditsCache.get(tmdbId);
}

/** The director (crew, job=Director), or null when absent. */
export function extractDirector(credits: TmdbMovieCredits): { id: number; name: string } | null {
  const director = credits.crew.find((c) => c.job === 'Director');
  return director ? { id: director.id, name: director.name } : null;
}

/** The first {@link LEAD_CAST_COUNT} cast members by billing order. */
export function extractLeadCast(credits: TmdbMovieCredits): { id: number; name: string }[] {
  return credits.cast
    .filter((c) => c.order < LEAD_CAST_COUNT)
    .toSorted((a, b) => a.order - b.order)
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Exposed for test reset. */
export function _clearCreditsCache(): void {
  creditsCache.clear();
}
