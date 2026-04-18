import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('redis module', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('exports null client and returns disconnected when REDIS_HOST is not set', async () => {
    vi.stubEnv('REDIS_HOST', '');
    const { getRedisClient, getRedisStatus } = await import('./redis.js');
    expect(getRedisClient()).toBeNull();
    expect(getRedisStatus()).toBe('disconnected');
  });

  it('does not throw when REDIS_HOST is missing', async () => {
    vi.stubEnv('REDIS_HOST', '');
    await expect(import('./redis.js')).resolves.toBeDefined();
  });
});
