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
  getCoreDrizzle: vi.fn(),
}));

vi.mock('@pops/core-db', () => ({
  settingsService: {
    getSettingOrNull: vi.fn(),
    setRawSetting: vi.fn(),
  },
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

vi.mock('@pops/media-db', () => ({
  episodes: { seasonId: 'seasonId', episodeNumber: 'episodeNumber', id: 'id' },
  seasons: { tvShowId: 'tvShowId', seasonNumber: 'seasonNumber', id: 'id' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
}));

import { settingsService, type CoreDb } from '@pops/core-db';

import { getCoreDrizzle } from '../../../db.js';
import { getEnv } from '../../../env.js';
import { PlexClient } from './client.js';
import { getPlexClient, getSyncStatus, testConnection } from './service.js';

const mockGetEnv = vi.mocked(getEnv);
const mockGetCoreDrizzle = vi.mocked(getCoreDrizzle);
const mockGetSettingOrNull = vi.mocked(settingsService.getSettingOrNull);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCoreDrizzle.mockReturnValue({} as CoreDb);
  mockGetSettingOrNull.mockReturnValue(null);
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

    mockGetSettingOrNull.mockReturnValue({ key: 'plex_token', value: 'abc123' });

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
