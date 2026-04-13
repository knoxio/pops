/**
 * Tests for Plex friends API — listing friends and fetching friend watchlists.
 *
 * PRD-071 US-03
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PlexApiError } from './types.js';
import { fetchPlexFriends, fetchFriendWatchlist } from './friends.js';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Tests: fetchPlexFriends
// ---------------------------------------------------------------------------

describe('fetchPlexFriends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and parses friends list', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 1,
          uuid: 'uuid-alice',
          title: 'Alice',
          username: 'alice',
          thumb: 'https://plex.tv/users/alice/avatar',
          restricted: false,
          home: false,
        },
        {
          id: 2,
          uuid: 'uuid-bob',
          title: 'Bob',
          username: 'bob',
          restricted: false,
          home: true,
        },
      ],
    });

    const friends = await fetchPlexFriends('test-token');

    expect(friends).toHaveLength(2);
    expect(friends[0]).toEqual({
      id: 1,
      uuid: 'uuid-alice',
      title: 'Alice',
      username: 'alice',
      thumb: 'https://plex.tv/users/alice/avatar',
      restricted: false,
      home: false,
    });
    expect(friends[1]!.thumb).toBeNull(); // No thumb provided
    expect(friends[1]!.home).toBe(true);
  });

  it('sends correct URL with token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await fetchPlexFriends('my-token');

    expect(mockFetch).toHaveBeenCalledWith('https://plex.tv/api/v2/friends?X-Plex-Token=my-token', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  });

  it('throws PlexApiError on non-ok response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(fetchPlexFriends('bad-token')).rejects.toThrow(PlexApiError);
    await expect(fetchPlexFriends('bad-token')).rejects.toThrow('401');
  });

  it('throws PlexApiError on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('DNS resolution failed'));

    await expect(fetchPlexFriends('test-token')).rejects.toThrow(
      'Network error fetching Plex friends'
    );
  });

  it('returns empty array when no friends', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const friends = await fetchPlexFriends('test-token');
    expect(friends).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchFriendWatchlist
// ---------------------------------------------------------------------------

describe('fetchFriendWatchlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches movie candidates from friend watchlist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        MediaContainer: {
          Metadata: [
            {
              ratingKey: 'key1',
              type: 'movie',
              title: 'Inception',
              year: 2010,
              Guid: [{ id: 'tmdb://27205' }, { id: 'imdb://tt1375666' }],
            },
            {
              ratingKey: 'key2',
              type: 'show', // TV show — should be filtered out
              title: 'Breaking Bad',
              year: 2008,
              Guid: [{ id: 'tvdb://81189' }],
            },
            {
              ratingKey: 'key3',
              type: 'movie',
              title: 'The Matrix',
              year: 1999,
              Guid: [{ id: 'tmdb://603' }],
            },
          ],
        },
      }),
    });

    const items = await fetchFriendWatchlist('token', 'client-id', 'friend-uuid');

    // Only movies with TMDB IDs
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ tmdbId: 27205, title: 'Inception', year: 2010 });
    expect(items[1]).toEqual({ tmdbId: 603, title: 'The Matrix', year: 1999 });
  });

  it('returns empty array for private/inaccessible watchlists (401)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const items = await fetchFriendWatchlist('token', 'client-id', 'private-friend');
    expect(items).toHaveLength(0);
  });

  it('returns empty array for 403 forbidden', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    });

    const items = await fetchFriendWatchlist('token', 'client-id', 'restricted-friend');
    expect(items).toHaveLength(0);
  });

  it('returns empty array for 404 not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    const items = await fetchFriendWatchlist('token', 'client-id', 'unknown-friend');
    expect(items).toHaveLength(0);
  });

  it('throws for unexpected errors (500)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    await expect(fetchFriendWatchlist('token', 'client-id', 'friend-uuid')).rejects.toThrow(
      PlexApiError
    );
  });

  it('skips movies without TMDB ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        MediaContainer: {
          Metadata: [
            {
              ratingKey: 'key1',
              type: 'movie',
              title: 'No TMDB Movie',
              year: 2020,
              Guid: [{ id: 'imdb://tt1234567' }], // Only IMDB, no TMDB
            },
          ],
        },
      }),
    });

    const items = await fetchFriendWatchlist('token', 'client-id', 'friend-uuid');
    expect(items).toHaveLength(0);
  });

  it('handles empty watchlist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ MediaContainer: {} }),
    });

    const items = await fetchFriendWatchlist('token', 'client-id', 'friend-uuid');
    expect(items).toHaveLength(0);
  });

  it('paginates through multiple pages', async () => {
    // Page 1: full page of 50 items
    const page1Items = Array.from({ length: 50 }, (_, i) => ({
      ratingKey: `key-${i}`,
      type: 'movie',
      title: `Movie ${i}`,
      year: 2020,
      Guid: [{ id: `tmdb://${1000 + i}` }],
    }));

    // Page 2: partial page of 5 items
    const page2Items = Array.from({ length: 5 }, (_, i) => ({
      ratingKey: `key-${50 + i}`,
      type: 'movie',
      title: `Movie ${50 + i}`,
      year: 2021,
      Guid: [{ id: `tmdb://${1050 + i}` }],
    }));

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ MediaContainer: { totalSize: 55, Metadata: page1Items } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ MediaContainer: { totalSize: 55, Metadata: page2Items } }),
      });

    const items = await fetchFriendWatchlist('token', 'client-id', 'friend-uuid');

    expect(items).toHaveLength(55);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify pagination params
    const firstUrl = mockFetch.mock.calls[0]![0] as string;
    const secondUrl = mockFetch.mock.calls[1]![0] as string;
    expect(firstUrl).toContain('X-Plex-Container-Start=0');
    expect(secondUrl).toContain('X-Plex-Container-Start=50');
  });

  it('includes friend UUID in request URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ MediaContainer: {} }),
    });

    await fetchFriendWatchlist('my-token', 'my-client', 'friend-uuid-123');

    const url = mockFetch.mock.calls[0]![0] as string;
    expect(url).toContain('X-Plex-Token=my-token');
    expect(url).toContain('X-Plex-Client-Identifier=my-client');
    expect(url).toContain('friend-uuid-123');
  });
});
