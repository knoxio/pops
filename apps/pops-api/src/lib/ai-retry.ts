import { getSettingValue } from '../modules/core/settings/service.js';

import type { Logger } from 'pino';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

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

  const maxRetries = getSettingValue('core.aiRetry.maxRetries', MAX_RETRIES);
  const baseDelay = getSettingValue('core.aiRetry.baseDelayMs', BASE_DELAY_MS);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit =
        error instanceof Error && 'status' in error && (error as { status: number }).status === 429;

      if (!isRateLimit || attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * 2 ** attempt + Math.random() * 500;
      logger?.warn(
        { context, attempt: attempt + 1, maxRetries, delayMs: Math.round(delay) },
        `${logPrefix} Rate limited (429) — retrying with backoff`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}
