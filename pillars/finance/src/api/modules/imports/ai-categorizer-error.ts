/**
 * AI categorization error — thrown when the Anthropic API call fails, no key
 * is configured, or the model's response cannot be parsed into a JSON object
 * (`PARSE_ERROR`). Its own module so tests can import it without pulling in the
 * SDK. The caller (`tryAiCategorization`) degrades any of these to an uncertain
 * row rather than failing the transaction.
 */
export class AiCategorizationError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_API_KEY' | 'API_ERROR' | 'INSUFFICIENT_CREDITS' | 'PARSE_ERROR'
  ) {
    super(message);
    this.name = 'AiCategorizationError';
  }
}
