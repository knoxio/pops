/**
 * TheTVDB index module tests — startup validation and client factory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getTvdbClient, setTvdbClient, validateTvdbConfig } from './index.js';

// Mock auth + client so getTvdbClient doesn't make real HTTP calls
vi.mock('./auth.js', () => ({
  TheTvdbAuth: vi.fn(),
}));
vi.mock('./client.js', () => ({
  TheTvdbClient: vi.fn(),
}));

beforeEach(() => {
  // Reset the singleton between tests
  setTvdbClient(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateTvdbConfig', () => {
  it('throws when THETVDB_API_KEY is not set', () => {
    vi.stubEnv('THETVDB_API_KEY', '');
    expect(() => validateTvdbConfig()).toThrow('THETVDB_API_KEY');
  });

  it('does not throw when THETVDB_API_KEY is set', () => {
    vi.stubEnv('THETVDB_API_KEY', 'test-key');
    expect(() => validateTvdbConfig()).not.toThrow();
  });
});

describe('getTvdbClient', () => {
  it('throws when THETVDB_API_KEY is not set', () => {
    vi.stubEnv('THETVDB_API_KEY', '');
    expect(() => getTvdbClient()).toThrow('THETVDB_API_KEY');
  });

  it('returns a client when THETVDB_API_KEY is set', () => {
    vi.stubEnv('THETVDB_API_KEY', 'test-key');
    const client = getTvdbClient();
    expect(client).toBeDefined();
  });

  it('returns the same singleton on subsequent calls', () => {
    vi.stubEnv('THETVDB_API_KEY', 'test-key');
    const client1 = getTvdbClient();
    const client2 = getTvdbClient();
    expect(client1).toBe(client2);
  });
});
