/**
 * Letterboxd list rotation source adapter.
 *
 * PRD-071 US-04: scrapes a Letterboxd list URL to extract movie entries,
 * then resolves TMDB IDs via Letterboxd's built-in TMDB links.
 *
 * Letterboxd list pages include `data-tmdb-id` attributes on film poster
 * elements, which we use directly instead of needing a separate API lookup.
 *
 * Config: { listUrl: string }
 */
import { logger } from '../../../lib/logger.js';

import type { CandidateMovie, RotationSourceAdapter } from './source-types.js';

const MAX_PAGES = 20;

export const letterboxdSource: RotationSourceAdapter = {
  type: 'letterboxd',

  async fetchCandidates(config: Record<string, unknown>): Promise<CandidateMovie[]> {
    const listUrl = config.listUrl;
    if (typeof listUrl !== 'string' || !listUrl.trim()) {
      throw new Error('letterboxd source requires a non-empty listUrl in config');
    }

    // Normalize URL — remove trailing slash, ensure it's a valid Letterboxd list URL
    const baseUrl = listUrl.replace(/\/+$/, '');

    const candidates: CandidateMovie[] = [];
    let page = 1;

    while (page <= MAX_PAGES) {
      const pageUrl = page === 1 ? `${baseUrl}/` : `${baseUrl}/page/${page}/`;

      let html: string;
      try {
        const response = await fetch(pageUrl, {
          headers: {
            Accept: 'text/html',
            'User-Agent': 'POPS/1.0 (rotation source sync)',
          },
        });

        if (!response.ok) {
          if (page === 1) {
            logger.warn(
              `[letterboxd] Failed to fetch list: ${response.status} ${response.statusText}`
            );
            return [];
          }
          // Non-first page failing likely means we've exhausted the list
          break;
        }

        html = await response.text();
      } catch (err) {
        logger.warn(
          `[letterboxd] Network error fetching page ${page}: ${err instanceof Error ? err.message : String(err)}`
        );
        return candidates; // Return what we have so far
      }

      const pageMovies = parseLetterboxdListPage(html);
      if (pageMovies.length === 0) break;

      candidates.push(...pageMovies);

      // Check if there's a next page link
      if (!html.includes('class="next"')) break;

      page++;
    }

    logger.info(`[letterboxd] Fetched ${candidates.length} candidates from ${baseUrl}`);
    return candidates;
  },
};

/**
 * Parse a Letterboxd list page HTML and extract movie entries.
 *
 * Letterboxd film poster elements use `data-film-slug` and include
 * TMDB IDs in `data-tmdb-id` attributes. Film titles are in the
 * `alt` attribute of the poster img tag.
 */
export function parseLetterboxdListPage(html: string): CandidateMovie[] {
  const candidates: CandidateMovie[] = [];

  // Match film poster containers with TMDB IDs
  // Pattern: data-film-slug="..." ... data-tmdb-id="NNN"
  const filmPattern = /data-film-slug="([^"]*)"[^>]*data-tmdb-id="(\d+)"[^>]*>/g;

  let match;
  while ((match = filmPattern.exec(html)) !== null) {
    const slug = match[1] ?? '';
    const tmdbId = Number(match[2]);

    if (!tmdbId) continue;

    // Try to extract title from nearby alt text or slug
    const title = slugToTitle(slug);

    // Extract year from nearby context if available
    const yearMatch = html
      .slice(Math.max(0, match.index - 200), match.index + 500)
      .match(/class="film-detail-content"[^>]*>.*?<small[^>]*>(\d{4})<\/small>/s);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    candidates.push({
      tmdbId,
      title,
      year,
      rating: null,
      posterPath: null,
    });
  }

  return candidates;
}

/** Convert a Letterboxd slug to a readable title (best-effort). */
function slugToTitle(slug: string): string {
  return slug
    .replace(/-\d{4}$/, '') // Remove trailing year
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
