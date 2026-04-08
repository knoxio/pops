import type { Logger } from "pino";

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
  const logPrefix = args?.logPrefix ?? "[AI]";

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit =
        error instanceof Error && "status" in error && (error as { status: number }).status === 429;

      if (!isRateLimit || attempt === MAX_RETRIES) {
        throw error;
      }

      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
      logger?.warn(
        { context, attempt: attempt + 1, maxRetries: MAX_RETRIES, delayMs: Math.round(delay) },
        `${logPrefix} Rate limited (429) — retrying with backoff`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Max retries exceeded");
}
