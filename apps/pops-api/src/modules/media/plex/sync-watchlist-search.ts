import { getTvdbClient } from '../thetvdb/index.js';
import { getTmdbClient } from '../tmdb/index.js';

/**
 * Search TMDB for a movie by title and optional year.
 * Returns the first result's TMDB ID if the title is a close match.
 */
export async function searchTmdbByTitleYear(
  title: string,
  year: number | null
): Promise<number | null> {
  try {
    const tmdbClient = getTmdbClient();
    const result = await tmdbClient.searchMovies(title);
    if (result.results.length === 0) return null;

    for (const r of result.results) {
      const titleMatch = r.title.toLowerCase() === title.toLowerCase();
      const yearMatch =
        year && r.releaseDate ? new Date(r.releaseDate).getFullYear() === year : true;
      if (titleMatch && yearMatch) return r.tmdbId;
    }

    const first = result.results[0];
    if (first && first.title.toLowerCase() === title.toLowerCase()) {
      return first.tmdbId;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Search TVDB for a TV show by title and optional year.
 * Returns the first result's TVDB ID if the title is a close match.
 */
export async function searchTvdbByTitle(
  title: string,
  year: number | null
): Promise<number | null> {
  try {
    const tvdbClient = getTvdbClient();
    const results = await tvdbClient.searchSeries(title);
    if (results.length === 0) return null;

    for (const r of results) {
      const nameMatch = r.name.toLowerCase() === title.toLowerCase();
      const yearMatch = year && r.year ? Number(r.year) === year : true;
      if (nameMatch && yearMatch) return r.tvdbId;
    }

    const first = results[0];
    if (first && first.name.toLowerCase() === title.toLowerCase()) {
      return first.tvdbId;
    }
    return null;
  } catch {
    return null;
  }
}
