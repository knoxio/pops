/**
 * TheTVDB-specific rate limiter.
 *
 * Wraps a TokenBucketRateLimiter (20 tokens, 2/sec refill) with
 * exponential backoff retry on 429 responses (up to 3 retries).
 */
import { SETTINGS_KEYS } from '@pops/types';

import { resolveNumber } from '../../core/settings/index.js';
import { TokenBucketRateLimiter } from '../../../shared/rate-limiter.js';

const DEFAULT_CAPACITY = 20;
const DEFAULT_REFILL_RATE = 2;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

/** Pre-configured rate limiter instance for TheTVDB. */
let instance: TokenBucketRateLimiter | null = null;

/** Get or create the singleton TheTVDB rate limiter. */
export function getTvdbRateLimiter(): TokenBucketRateLimiter {
  instance ??= new TokenBucketRateLimiter(
    resolveNumber(SETTINGS_KEYS.THETVDB_CAPACITY, DEFAULT_CAPACITY),
    resolveNumber(SETTINGS_KEYS.THETVDB_REFILL_RATE, DEFAULT_REFILL_RATE)
  );
  return instance;
}

/** Replace the singleton (for testing). */
export function setTvdbRateLimiter(limiter: TokenBucketRateLimiter | null): void {
  instance = limiter;
}

/**
 * Execute a fetch with rate limiting and 429 exponential backoff.
 *
 * Acquires a token before each attempt. On 429, waits with exponential
 * backoff (1s, 2s, 4s) and retries up to 3 times.
 *
 * @param fn - Async function that performs the HTTP request
 * @returns The Response from the successful request
 * @throws The last error if all retries are exhausted
 */
export async function fetchWithRetry(fn: () => Promise<Response>): Promise<Response> {
  const limiter = getTvdbRateLimiter();
  const maxRetries = resolveNumber(SETTINGS_KEYS.THETVDB_MAX_RETRIES, DEFAULT_MAX_RETRIES);
  const baseDelay = resolveNumber(SETTINGS_KEYS.THETVDB_BASE_DELAY_MS, DEFAULT_BASE_DELAY_MS);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await limiter.acquire();
    const response = await fn();

    if (response.status !== 429) {
      return response;
    }

    // Last attempt — don't retry
    if (attempt === maxRetries) {
      return response;
    }

    // Exponential backoff: 1s, 2s, 4s
    const delayMs = baseDelay * Math.pow(2, attempt);
    await sleep(delayMs);
  }

  // Unreachable, but TypeScript needs it
  throw new Error('fetchWithRetry: unexpected code path');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
