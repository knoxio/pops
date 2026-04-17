/**
 * Plex service tests — client factory, connection, and status.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing service
vi.mock('./client.js', () => ({
  PlexClient: vi.fn(),
}));

vi.mock('../../../env.js', () => ({
  getEnv: vi.fn(),
}));

vi.mock('../../../db.js', () => ({
  getDrizzle: vi.fn(),
}));

vi.mock('../library/service.js', () => ({
  addMovie: vi.fn(),
}));

vi.mock('../library/tv-show-service.js', () => ({
  addTvShow: vi.fn(),
}));

vi.mock('../tmdb/index.js', () => ({
  getTmdbClient: vi.fn(),
}));

vi.mock('../thetvdb/index.js', () => ({
  getTvdbClient: vi.fn(),
}));

vi.mock('../tv-shows/service.js', () => ({
  getTvShowByTvdbId: vi.fn(),
}));

vi.mock('../watch-history/service.js', () => ({
  logWatch: vi.fn(),
}));

vi.mock('@pops/db-types', () => ({
  episodes: { seasonId: 'seasonId', episodeNumber: 'episodeNumber', id: 'id' },
  seasons: { tvShowId: 'tvShowId', seasonNumber: 'seasonNumber', id: 'id' },
  settings: { key: 'key', value: 'value' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

import { getDrizzle } from '../../../db.js';
import { getEnv } from '../../../env.js';
import { PlexClient } from './client.js';
import { getPlexClient, getSyncStatus, testConnection } from './service.js';

// Now import the service
import type { BetterSQLite3Database } from '../../../db.js';

const mockGetEnv = vi.mocked(getEnv);
const mockGetDrizzle = vi.mocked(getDrizzle);

function createMockDrizzle(getReturnValue: unknown = undefined): BetterSQLite3Database {
  const chain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockReturnValue(getReturnValue),
  };
  return chain as unknown as BetterSQLite3Database;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDrizzle.mockReturnValue(createMockDrizzle());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPlexClient', () => {
  it('returns null when PLEX_URL is not set', () => {
    mockGetEnv.mockReturnValue(undefined);
    expect(getPlexClient()).toBeNull();
  });

  it('returns null when PLEX_TOKEN is not in db', () => {
    mockGetEnv.mockImplementation((name) =>
      name === 'PLEX_URL' ? 'http://plex:32400' : undefined
    );
    expect(getPlexClient()).toBeNull();
  });

  it('returns PlexClient when both url and token are set', () => {
    mockGetEnv.mockImplementation((name) => {
      if (name === 'PLEX_URL') return 'http://plex:32400';
      return undefined;
    });

    mockGetDrizzle.mockReturnValue(createMockDrizzle({ value: 'abc123' }));

    const client = getPlexClient();
    expect(client).toBeInstanceOf(PlexClient);
  });
});

describe('testConnection', () => {
  it('returns true when getLibraries succeeds', async () => {
    const mockClient = {
      getLibraries: vi.fn().mockResolvedValue([]),
    } as unknown as PlexClient;

    const result = await testConnection(mockClient);
    expect(result).toBe(true);
    expect(mockClient.getLibraries).toHaveBeenCalledOnce();
  });

  it('returns false when getLibraries fails', async () => {
    const mockClient = {
      getLibraries: vi.fn().mockRejectedValue(new Error('Connection refused')),
    } as unknown as PlexClient;

    const result = await testConnection(mockClient);
    expect(result).toBe(false);
  });
});

describe('getSyncStatus', () => {
  it('reports not configured when client is null', () => {
    const status = getSyncStatus(null);
    expect(status.configured).toBe(false);
  });

  it('reports configured when client is provided', () => {
    const mockClient = {} as PlexClient;
    const status = getSyncStatus(mockClient);
    expect(status.configured).toBe(true);
  });
});
