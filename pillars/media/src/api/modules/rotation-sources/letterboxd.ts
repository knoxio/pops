/**
 * Letterboxd list rotation source adapter.
 *
 * Scrapes a Letterboxd list URL, extracting `data-tmdb-id` attributes from the
 * film poster elements (Letterboxd embeds TMDB IDs directly, so no separate
 * lookup is needed). Config shape: `{ listUrl: string }`.
 */
import type { CandidateMovie, RotationSourceAdapter } from '../rotation-source-types.js';

const MAX_PAGES = 20;

type PageFetchResult =
  | { kind: 'ok'; html: string }
  | { kind: 'first-page-error' }
  | { kind: 'stop' }
  | { kind: 'network-error' };

async function fetchListPageHtml(pageUrl: string, page: number): Promise<PageFetchResult> {
  try {
    const response = await fetch(pageUrl, {
      headers: { Accept: 'text/html', 'User-Agent': 'POPS/1.0 (rotation source sync)' },
    });
    if (!response.ok) {
      if (page === 1) {
        console.warn(
          `[letterboxd] Failed to fetch list: ${response.status} ${response.statusText}`
        );
        return { kind: 'first-page-error' };
      }
      return { kind: 'stop' };
    }
    return { kind: 'ok', html: await response.text() };
  } catch (err) {
    console.warn(
      `[letterboxd] Network error fetching page ${page}: ${err instanceof Error ? err.message : String(err)}`
    );
    return { kind: 'network-error' };
  }
}

export const letterboxdSource: RotationSourceAdapter = {
  type: 'letterboxd',

  async fetchCandidates(config: Record<string, unknown>): Promise<CandidateMovie[]> {
    const listUrl = config.listUrl;
    if (typeof listUrl !== 'string' || !listUrl.trim()) {
      throw new Error('letterboxd source requires a non-empty listUrl in config');
    }

    const baseUrl = listUrl.replace(/\/+$/, '');
    const candidates: CandidateMovie[] = [];
    let page = 1;

    while (page <= MAX_PAGES) {
      const pageUrl = page === 1 ? `${baseUrl}/` : `${baseUrl}/page/${page}/`;
      const fetched = await fetchListPageHtml(pageUrl, page);
      if (fetched.kind === 'first-page-error') return [];
      if (fetched.kind === 'stop') break;
      if (fetched.kind === 'network-error') return candidates;
      const pageMovies = parseLetterboxdListPage(fetched.html);
      if (pageMovies.length === 0) break;
      candidates.push(...pageMovies);
      if (!fetched.html.includes('class="next"')) break;
      page++;
    }

    return candidates;
  },
};

/**
 * Parse a Letterboxd list page, extracting film entries with TMDB IDs.
 * Exported for direct unit testing of the regex extraction.
 */
export function parseLetterboxdListPage(html: string): CandidateMovie[] {
  const candidates: CandidateMovie[] = [];
  const filmPattern = /data-film-slug="([^"]*)"[^>]*data-tmdb-id="(\d+)"[^>]*>/g;

  let match;
  while ((match = filmPattern.exec(html)) !== null) {
    const slug = match[1] ?? '';
    const tmdbId = Number(match[2]);
    if (!tmdbId) continue;

    const yearMatch = html
      .slice(Math.max(0, match.index - 200), match.index + 500)
      .match(/class="film-detail-content"[^>]*>.*?<small[^>]*>(\d{4})<\/small>/s);
    const year = yearMatch ? Number(yearMatch[1]) : null;

    candidates.push({ tmdbId, title: slugToTitle(slug), year, rating: null, posterPath: null });
  }

  return candidates;
}

/** Convert a Letterboxd slug to a readable title (best-effort). */
function slugToTitle(slug: string): string {
  return slug
    .replace(/-\d{4}$/, '')
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
