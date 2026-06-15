/**
 * Arr service tests — tests client factory and status caching.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
const deleteStub = vi.fn<(input: { key: string }) => Promise<{ message: string }>>();

vi.mock('@pops/pillar-sdk/server', () => ({
  pillar: () => ({
    settings: {
      get: { orThrow: getStub },
      getMany: { orThrow: getManyStub },
      set: { orThrow: setStub },
      delete: { orThrow: deleteStub },
    },
  }),
}));

import { clearStatusCache, getArrConfig, getRadarrClient, getSonarrClient } from './service.js';

describe('Arr service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearStatusCache();
    getStub.mockReset().mockResolvedValue({ data: null });
    getManyStub.mockReset().mockResolvedValue({ settings: {} });
    setStub.mockReset();
    deleteStub.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('getRadarrClient', () => {
    it('returns null when RADARR_URL is not set', async () => {
      delete process.env['RADARR_URL'];
      delete process.env['RADARR_API_KEY'];
      expect(await getRadarrClient()).toBeNull();
    });

    it('returns null when RADARR_API_KEY is not set', async () => {
      process.env['RADARR_URL'] = 'http://localhost:7878';
      delete process.env['RADARR_API_KEY'];
      expect(await getRadarrClient()).toBeNull();
    });

    it('returns a client when both env vars are set', async () => {
      process.env['RADARR_URL'] = 'http://localhost:7878';
      process.env['RADARR_API_KEY'] = 'test-key';
      const client = await getRadarrClient();
      expect(client).not.toBeNull();
    });
  });

  describe('getSonarrClient', () => {
    it('returns null when SONARR_URL is not set', async () => {
      delete process.env['SONARR_URL'];
      delete process.env['SONARR_API_KEY'];
      expect(await getSonarrClient()).toBeNull();
    });

    it('returns null when SONARR_API_KEY is not set', async () => {
      process.env['SONARR_URL'] = 'http://localhost:8989';
      delete process.env['SONARR_API_KEY'];
      expect(await getSonarrClient()).toBeNull();
    });

    it('returns a client when both env vars are set', async () => {
      process.env['SONARR_URL'] = 'http://localhost:8989';
      process.env['SONARR_API_KEY'] = 'test-key';
      const client = await getSonarrClient();
      expect(client).not.toBeNull();
    });
  });

  describe('getArrConfig', () => {
    it('reports both unconfigured when no env vars set', async () => {
      delete process.env['RADARR_URL'];
      delete process.env['RADARR_API_KEY'];
      delete process.env['SONARR_URL'];
      delete process.env['SONARR_API_KEY'];

      const config = await getArrConfig();
      expect(config.radarrConfigured).toBe(false);
      expect(config.sonarrConfigured).toBe(false);
    });

    it('reports radarr configured when env vars set', async () => {
      process.env['RADARR_URL'] = 'http://localhost:7878';
      process.env['RADARR_API_KEY'] = 'test-key';
      delete process.env['SONARR_URL'];
      delete process.env['SONARR_API_KEY'];

      const config = await getArrConfig();
      expect(config.radarrConfigured).toBe(true);
      expect(config.sonarrConfigured).toBe(false);
    });

    it('reports both configured when all env vars set', async () => {
      process.env['RADARR_URL'] = 'http://localhost:7878';
      process.env['RADARR_API_KEY'] = 'radarr-key';
      process.env['SONARR_URL'] = 'http://localhost:8989';
      process.env['SONARR_API_KEY'] = 'sonarr-key';

      const config = await getArrConfig();
      expect(config.radarrConfigured).toBe(true);
      expect(config.sonarrConfigured).toBe(true);
    });
  });
});
