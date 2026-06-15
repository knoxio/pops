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

const getStub =
  vi.fn<(input: { key: string }) => Promise<{ data: { key: string; value: string } | null }>>();
const getManyStub =
  vi.fn<(input: { keys: string[] }) => Promise<{ settings: Record<string, string> }>>();
const setStub = vi.fn<
  (input: { key: string; value: string }) => Promise<{
    data: { key: string; value: string };
    message: string;
  }>
>();
const ensureStub =
  vi.fn<
    (input: { key: string; value: string }) => Promise<{ data: { key: string; value: string } }>
  >();
const deleteStub = vi.fn<(input: { key: string }) => Promise<{ message: string }>>();

vi.mock('@pops/pillar-sdk/server', () => ({
  pillar: () => ({
    settings: {
      get: { orThrow: getStub },
      getMany: { orThrow: getManyStub },
      set: { orThrow: setStub },
      ensure: { orThrow: ensureStub },
      delete: { orThrow: deleteStub },
    },
  }),
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

import { getEnv } from '../../../env.js';
import { PlexClient } from './client.js';
import { getPlexClient, getSyncStatus, testConnection } from './service.js';

const mockGetEnv = vi.mocked(getEnv);

beforeEach(() => {
  vi.clearAllMocks();
  getStub.mockReset().mockResolvedValue({ data: null });
  getManyStub.mockReset().mockResolvedValue({ settings: {} });
  setStub.mockReset();
  ensureStub.mockReset();
  deleteStub.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getPlexClient', () => {
  it('returns null when PLEX_URL is not set', async () => {
    mockGetEnv.mockReturnValue(undefined);
    expect(await getPlexClient()).toBeNull();
  });

  it('returns null when PLEX_TOKEN is not in db', async () => {
    mockGetEnv.mockImplementation((name) =>
      name === 'PLEX_URL' ? 'http://plex:32400' : undefined
    );
    expect(await getPlexClient()).toBeNull();
  });

  it('returns PlexClient when both url and token are set', async () => {
    mockGetEnv.mockImplementation((name) => {
      if (name === 'PLEX_URL') return 'http://plex:32400';
      if (name === 'ENCRYPTION_KEY') return 'test-key';
      return undefined;
    });

    getManyStub.mockResolvedValue({
      settings: { plex_url: 'http://plex:32400', plex_token: 'abc123' },
    });

    const client = await getPlexClient();
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
  it('reports not configured when client is null', async () => {
    const status = await getSyncStatus(null);
    expect(status.configured).toBe(false);
  });

  it('reports configured when client is provided', async () => {
    const mockClient = {} as PlexClient;
    const status = await getSyncStatus(mockClient);
    expect(status.configured).toBe(true);
  });
});
