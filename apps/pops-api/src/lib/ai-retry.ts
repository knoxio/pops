import { SETTINGS_KEYS } from '@pops/types';

import { resolveNumber } from '../modules/core/settings/resolve.js';

import type { Logger } from 'pino';

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 1000;

/**
 * Retry an async operation with exponential backoff + jitter on HTTP 429.
 * All Anthropic API calls should go through this to handle rate limits consistently.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  context: string,
  args?: { logger?: Logger; logPrefix?: string }
): Promise<T> {
  const logger = args?.logger;
  const logPrefix = args?.logPrefix ?? '[AI]';
  const maxRetries = resolveNumber(SETTINGS_KEYS.AI_RETRY_MAX_RETRIES, DEFAULT_MAX_RETRIES);
  const baseDelayMs = resolveNumber(SETTINGS_KEYS.AI_RETRY_BASE_DELAY_MS, DEFAULT_BASE_DELAY_MS);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit =
        error instanceof Error && 'status' in error && (error as { status: number }).status === 429;

      if (!isRateLimit || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelayMs * 2 ** attempt + Math.random() * 500;
      logger?.warn(
        { context, attempt: attempt + 1, maxRetries, delayMs: Math.round(delay) },
        `${logPrefix} Rate limited (429) — retrying with backoff`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}
