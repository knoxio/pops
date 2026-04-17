/**
 * TheTVDB-specific rate limiter.
 *
 * Wraps a TokenBucketRateLimiter (20 tokens, 2/sec refill) with
 * exponential backoff retry on 429 responses (up to 3 retries).
 */
import { TokenBucketRateLimiter } from '../../../shared/rate-limiter.js';

const THETVDB_CAPACITY = 20;
const THETVDB_REFILL_RATE = 2; // tokens per second
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/** Pre-configured rate limiter instance for TheTVDB. */
let instance: TokenBucketRateLimiter | null = null;

/** Get or create the singleton TheTVDB rate limiter. */
export function getTvdbRateLimiter(): TokenBucketRateLimiter {
  instance ??= new TokenBucketRateLimiter(THETVDB_CAPACITY, THETVDB_REFILL_RATE);
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

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await limiter.acquire();
    const response = await fn();

    if (response.status !== 429) {
      return response;
    }

    // Last attempt — don't retry
    if (attempt === MAX_RETRIES) {
      return response;
    }

    // Exponential backoff: 1s, 2s, 4s
    const delay = BASE_DELAY_MS * Math.pow(2, attempt);
    await sleep(delay);
  }

  // Unreachable, but TypeScript needs it
  throw new Error('fetchWithRetry: unexpected code path');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
