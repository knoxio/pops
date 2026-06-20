import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';

const KEYS = [
  'REDIS_URL',
  'POPS_API_URL',
  'POPS_API_INTERNAL_TOKEN',
  'FOOD_WORKER_CONCURRENCY',
  'FOOD_INGEST_RATE_PER_MIN',
  'FOOD_INGEST_TIMEOUT_SEC',
  'FOOD_WORKER_HEALTH_PORT',
  'FOOD_WORKER_DRAIN_TIMEOUT_MS',
  'POPS_WORKER_FOOD_VERSION',
  'FOOD_INGEST_DIR',
  'INSTAGRAM_COOKIES_PATH',
] as const;

const snapshot: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

describe('loadConfig', () => {
  it('fails fast when the internal token is missing', () => {
    expect(() => loadConfig()).toThrow(/POPS_API_INTERNAL_TOKEN/);
  });

  it('returns defaults when only the token is set', () => {
    process.env['POPS_API_INTERNAL_TOKEN'] = 'tok';
    const cfg = loadConfig();
    expect(cfg).toEqual({
      redisUrl: 'redis://localhost:6379',
      apiUrl: 'http://localhost:3000',
      internalToken: 'tok',
      concurrency: 2,
      ratePerMin: 30,
      jobTimeoutSec: 300,
      healthPort: 9090,
      drainTimeoutMs: 60_000,
      extractorVersion: 'pops-worker-food@0.1.0',
      ingestDir: '/data/food/ingest',
      instagramCookiesPath: '/secrets/instagram-cookies.txt',
    });
  });

  it('respects env overrides', () => {
    process.env['POPS_API_INTERNAL_TOKEN'] = 'tok';
    process.env['REDIS_URL'] = 'redis://redis:6379';
    process.env['POPS_API_URL'] = 'http://api:3000/';
    process.env['FOOD_WORKER_CONCURRENCY'] = '4';
    process.env['FOOD_INGEST_RATE_PER_MIN'] = '60';
    process.env['FOOD_INGEST_TIMEOUT_SEC'] = '120';
    process.env['FOOD_WORKER_HEALTH_PORT'] = '9999';
    process.env['FOOD_WORKER_DRAIN_TIMEOUT_MS'] = '30000';
    process.env['POPS_WORKER_FOOD_VERSION'] = 'pops-worker-food@1.2.3';
    process.env['FOOD_INGEST_DIR'] = '/tmp/ingest';
    process.env['INSTAGRAM_COOKIES_PATH'] = '/tmp/cookies.txt';
    const cfg = loadConfig();
    expect(cfg).toEqual({
      redisUrl: 'redis://redis:6379',
      apiUrl: 'http://api:3000/',
      internalToken: 'tok',
      concurrency: 4,
      ratePerMin: 60,
      jobTimeoutSec: 120,
      healthPort: 9999,
      drainTimeoutMs: 30_000,
      extractorVersion: 'pops-worker-food@1.2.3',
      ingestDir: '/tmp/ingest',
      instagramCookiesPath: '/tmp/cookies.txt',
    });
  });

  it('rejects non-positive concurrency', () => {
    process.env['POPS_API_INTERNAL_TOKEN'] = 'tok';
    process.env['FOOD_WORKER_CONCURRENCY'] = '0';
    expect(() => loadConfig()).toThrow(/FOOD_WORKER_CONCURRENCY/);
  });

  it('rejects non-numeric rate limits', () => {
    process.env['POPS_API_INTERNAL_TOKEN'] = 'tok';
    process.env['FOOD_INGEST_RATE_PER_MIN'] = 'fast';
    expect(() => loadConfig()).toThrow(/FOOD_INGEST_RATE_PER_MIN/);
  });

  it('rejects decimal values (silent floor would hide misconfiguration)', () => {
    process.env['POPS_API_INTERNAL_TOKEN'] = 'tok';
    process.env['FOOD_WORKER_CONCURRENCY'] = '1.9';
    expect(() => loadConfig()).toThrow(/FOOD_WORKER_CONCURRENCY/);
  });
});
