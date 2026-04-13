/**
 * Tests for the Plex friends watchlist rotation source adapter.
 *
 * PRD-071 US-03
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../lib/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../plex/service.js', () => ({
  getPlexToken: vi.fn(),
  getPlexClientId: vi.fn(() => 'test-client-id'),
}));

vi.mock('../plex/friends.js', () => ({
  fetchFriendWatchlist: vi.fn(),
}));

import { logger } from '../../../lib/logger.js';
import { getPlexToken } from '../plex/service.js';
import { fetchFriendWatchlist } from '../plex/friends.js';
import { plexFriendsSource } from './plex-friends-source.js';

const mockGetPlexToken = vi.mocked(getPlexToken);
const mockFetchFriendWatchlist = vi.mocked(fetchFriendWatchlist);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('plexFriendsSource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlexToken.mockReturnValue('test-token');
  });

  it('has correct type identifier', () => {
    expect(plexFriendsSource.type).toBe('plex_friends');
  });

  it('throws if friendUuid is missing from config', async () => {
    await expect(plexFriendsSource.fetchCandidates({})).rejects.toThrow(
      'plex_friends source requires "friendUuid" in config'
    );
  });

  it('throws if friendUuid is not a string', async () => {
    await expect(plexFriendsSource.fetchCandidates({ friendUuid: 123 })).rejects.toThrow(
      'plex_friends source requires "friendUuid" in config'
    );
  });

  it('throws if Plex token is not configured', async () => {
    mockGetPlexToken.mockReturnValue(null);

    await expect(plexFriendsSource.fetchCandidates({ friendUuid: 'abc-123' })).rejects.toThrow(
      'Plex token not configured'
    );
  });

  it('fetches friend watchlist and returns movie candidates', async () => {
    mockFetchFriendWatchlist.mockResolvedValue([
      { tmdbId: 550, title: 'Fight Club', year: 1999 },
      { tmdbId: 680, title: 'Pulp Fiction', year: 1994 },
    ]);

    const candidates = await plexFriendsSource.fetchCandidates({
      friendUuid: 'abc-123',
      friendUsername: 'alice',
    });

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({
      tmdbId: 550,
      title: 'Fight Club',
      year: 1999,
      rating: null,
      posterPath: null,
    });
    expect(candidates[1]).toEqual({
      tmdbId: 680,
      title: 'Pulp Fiction',
      year: 1994,
      rating: null,
      posterPath: null,
    });

    expect(mockFetchFriendWatchlist).toHaveBeenCalledWith(
      'test-token',
      'test-client-id',
      'abc-123'
    );
  });

  it('returns empty array and logs warning when friend watchlist is inaccessible', async () => {
    mockFetchFriendWatchlist.mockRejectedValue(new Error('Private watchlist'));

    const candidates = await plexFriendsSource.fetchCandidates({
      friendUuid: 'private-friend',
      friendUsername: 'bob',
    });

    expect(candidates).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ friendUuid: 'private-friend', friendLabel: 'bob' }),
      expect.stringContaining('Could not access friend watchlist')
    );
  });

  it('uses friendUuid as label when friendUsername is not provided', async () => {
    mockFetchFriendWatchlist.mockRejectedValue(new Error('Access denied'));

    const candidates = await plexFriendsSource.fetchCandidates({
      friendUuid: 'some-uuid',
    });

    expect(candidates).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ friendLabel: 'some-uuid' }),
      expect.stringContaining('Could not access friend watchlist')
    );
  });

  it('returns empty array when friend has no movies', async () => {
    mockFetchFriendWatchlist.mockResolvedValue([]);

    const candidates = await plexFriendsSource.fetchCandidates({
      friendUuid: 'empty-friend',
    });

    expect(candidates).toHaveLength(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ friendUuid: 'empty-friend' }),
      expect.stringContaining('no accessible movie watchlist items')
    );
  });

  it('handles candidates with null year', async () => {
    mockFetchFriendWatchlist.mockResolvedValue([
      { tmdbId: 999, title: 'Unknown Year Movie', year: null },
    ]);

    const candidates = await plexFriendsSource.fetchCandidates({
      friendUuid: 'abc-123',
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.year).toBeNull();
  });
});
