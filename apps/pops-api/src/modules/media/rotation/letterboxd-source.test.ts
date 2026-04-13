/**
 * Tests for Letterboxd list rotation source adapter.
 *
 * PRD-071 US-04
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseLetterboxdListPage } from './letterboxd-source.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock logger
vi.mock('../../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

const { letterboxdSource } = await import('./letterboxd-source.js');

// ---------------------------------------------------------------------------
// Sample HTML fragments that mimic Letterboxd list page structure
// ---------------------------------------------------------------------------

const SAMPLE_LIST_PAGE = `
<html>
<body>
<ul class="poster-list">
  <li class="poster-container">
    <div data-film-slug="the-shawshank-redemption-1994" data-tmdb-id="278" class="film-poster">
      <img alt="The Shawshank Redemption" src="/poster.jpg" />
    </div>
  </li>
  <li class="poster-container">
    <div data-film-slug="the-godfather-1972" data-tmdb-id="238" class="film-poster">
      <img alt="The Godfather" src="/poster2.jpg" />
    </div>
  </li>
  <li class="poster-container">
    <div data-film-slug="the-dark-knight-2008" data-tmdb-id="155" class="film-poster">
      <img alt="The Dark Knight" src="/poster3.jpg" />
    </div>
  </li>
</ul>
</body>
</html>
`;

const SAMPLE_PAGE_WITH_NEXT = `
<html>
<body>
<ul class="poster-list">
  <li class="poster-container">
    <div data-film-slug="inception-2010" data-tmdb-id="27205" class="film-poster">
      <img alt="Inception" src="/poster.jpg" />
    </div>
  </li>
</ul>
<a class="next" href="/page/2/">Next</a>
</body>
</html>
`;

const SAMPLE_PAGE_2 = `
<html>
<body>
<ul class="poster-list">
  <li class="poster-container">
    <div data-film-slug="the-matrix-1999" data-tmdb-id="603" class="film-poster">
      <img alt="The Matrix" src="/poster.jpg" />
    </div>
  </li>
</ul>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// Tests: parseLetterboxdListPage (pure function)
// ---------------------------------------------------------------------------

describe('parseLetterboxdListPage', () => {
  it('extracts movies with TMDB IDs from HTML', () => {
    const movies = parseLetterboxdListPage(SAMPLE_LIST_PAGE);

    expect(movies).toHaveLength(3);
    expect(movies[0]).toMatchObject({ tmdbId: 278, title: 'The Shawshank Redemption' });
    expect(movies[1]).toMatchObject({ tmdbId: 238, title: 'The Godfather' });
    expect(movies[2]).toMatchObject({ tmdbId: 155, title: 'The Dark Knight' });
  });

  it('returns empty array for HTML with no films', () => {
    const movies = parseLetterboxdListPage('<html><body>No movies here</body></html>');
    expect(movies).toHaveLength(0);
  });

  it('derives title from slug', () => {
    const movies = parseLetterboxdListPage(
      '<div data-film-slug="pulp-fiction-1994" data-tmdb-id="680" class="film">'
    );
    expect(movies[0]!.title).toBe('Pulp Fiction');
  });

  it('sets rating and posterPath to null', () => {
    const movies = parseLetterboxdListPage(SAMPLE_LIST_PAGE);
    for (const movie of movies) {
      expect(movie.rating).toBeNull();
      expect(movie.posterPath).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: letterboxdSource adapter
// ---------------------------------------------------------------------------

describe('letterboxdSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct type identifier', () => {
    expect(letterboxdSource.type).toBe('letterboxd');
  });

  it('throws when listUrl is missing', async () => {
    await expect(letterboxdSource.fetchCandidates({})).rejects.toThrow(
      'letterboxd source requires a non-empty listUrl'
    );
  });

  it('throws when listUrl is empty string', async () => {
    await expect(letterboxdSource.fetchCandidates({ listUrl: '' })).rejects.toThrow(
      'letterboxd source requires a non-empty listUrl'
    );
  });

  it('fetches and parses a single-page list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SAMPLE_LIST_PAGE,
    });

    const candidates = await letterboxdSource.fetchCandidates({
      listUrl: 'https://letterboxd.com/user/list/my-list',
    });

    expect(candidates).toHaveLength(3);
    expect(candidates[0]!.tmdbId).toBe(278);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://letterboxd.com/user/list/my-list/',
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('paginates across multiple pages', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_PAGE_WITH_NEXT,
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_PAGE_2,
      });

    const candidates = await letterboxdSource.fetchCandidates({
      listUrl: 'https://letterboxd.com/user/list/my-list',
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.tmdbId).toBe(27205);
    expect(candidates[1]!.tmdbId).toBe(603);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('returns empty array on HTTP error for first page', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const candidates = await letterboxdSource.fetchCandidates({
      listUrl: 'https://letterboxd.com/user/list/does-not-exist',
    });

    expect(candidates).toHaveLength(0);
  });

  it('returns partial results when later page fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        text: async () => SAMPLE_PAGE_WITH_NEXT,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

    const candidates = await letterboxdSource.fetchCandidates({
      listUrl: 'https://letterboxd.com/user/list/my-list',
    });

    // Returns the first page results only
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.tmdbId).toBe(27205);
  });

  it('returns partial results on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

    const candidates = await letterboxdSource.fetchCandidates({
      listUrl: 'https://letterboxd.com/user/list/my-list',
    });

    expect(candidates).toHaveLength(0);
  });

  it('strips trailing slash from URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => SAMPLE_LIST_PAGE,
    });

    await letterboxdSource.fetchCandidates({
      listUrl: 'https://letterboxd.com/user/list/my-list/',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://letterboxd.com/user/list/my-list/',
      expect.any(Object)
    );
  });
});
