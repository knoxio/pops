/**
 * TMDB / TheTVDB title-based search fallbacks for watchlist resolution.
 *
 * Ported from the monolith `sync-watchlist-search.ts`; clients are injected
 * (the pillar resolves the env-configured singletons at the handler boundary).
 */
import type { TheTvdbClient } from '../../thetvdb/client.js';
import type { TmdbClient } from '../../tmdb/client.js';

/** TMDB movie search by title + optional year. Returns the closest TMDB id. */
export async function searchTmdbByTitleYear(
  tmdbClient: TmdbClient,
  title: string,
  year: number | null
): Promise<number | null> {
  try {
    const result = await tmdbClient.searchMovies(title);
    if (result.results.length === 0) return null;
    for (const r of result.results) {
      const titleMatch = r.title.toLowerCase() === title.toLowerCase();
      const yearMatch =
        year && r.releaseDate ? new Date(r.releaseDate).getFullYear() === year : true;
      if (titleMatch && yearMatch) return r.tmdbId;
    }
    const first = result.results[0];
    if (first && first.title.toLowerCase() === title.toLowerCase()) return first.tmdbId;
    return null;
  } catch {
    return null;
  }
}

/** TheTVDB series search by title + optional year. Returns the closest TVDB id. */
export async function searchTvdbByTitle(
  tvdbClient: TheTvdbClient,
  title: string,
  year: number | null
): Promise<number | null> {
  try {
    const results = await tvdbClient.searchSeries(title);
    if (results.length === 0) return null;
    for (const r of results) {
      const nameMatch = r.name.toLowerCase() === title.toLowerCase();
      const yearMatch = year && r.year ? Number(r.year) === year : true;
      if (nameMatch && yearMatch) return r.tvdbId;
    }
    const first = results[0];
    if (first && first.name.toLowerCase() === title.toLowerCase()) return first.tvdbId;
    return null;
  } catch {
    return null;
  }
}
