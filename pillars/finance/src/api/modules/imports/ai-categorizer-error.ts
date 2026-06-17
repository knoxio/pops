/**
 * AI categorization error — thrown when the Anthropic API call fails or no
 * key is configured. Its own module so tests can import it without pulling
 * in the SDK. Ported verbatim from the monolith.
 */
export class AiCategorizationError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_API_KEY' | 'API_ERROR' | 'INSUFFICIENT_CREDITS'
  ) {
    super(message);
    this.name = 'AiCategorizationError';
  }
}
