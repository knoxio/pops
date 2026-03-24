/**
 * AI categorization error - thrown when AI API fails.
 * Extracted into its own module so tests can import it
 * without pulling in heavy dependencies (Anthropic SDK, DB, etc.).
 */
export class AiCategorizationError extends Error {
  constructor(
    message: string,
    public readonly code: "NO_API_KEY" | "API_ERROR" | "INSUFFICIENT_CREDITS"
  ) {
    super(message);
    this.name = "AiCategorizationError";
  }
}
