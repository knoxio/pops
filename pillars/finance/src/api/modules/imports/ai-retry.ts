/**
 * Retry an async Anthropic call with exponential backoff + jitter on HTTP
 * 429. Ported from the monolith's `lib/ai-retry`, with the retry bounds
 * hardcoded (the pillar drops the core-settings lookup) and pino swapped
 * for `console.warn`.
 */
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export async function withRateLimitRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRateLimit =
        error instanceof Error && 'status' in error && (error as { status: number }).status === 429;
      if (!isRateLimit || attempt === MAX_RETRIES) throw error;

      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
      console.warn(
        `[AI] Rate limited (429) on "${context}" — retry ${attempt + 1}/${MAX_RETRIES} in ${Math.round(delay)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}
