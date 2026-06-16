/**
 * User-facing error formatting for the import pipeline.
 *
 * Copied (per the severance rules) from the monolith `lib/errors.ts`, minus the
 * `AiCategorizationError` branch — that error type belongs to the AI categorizer
 * which is stubbed out in F1. F2 reintroduces the AI-specific formatting
 * alongside the real categorizer.
 */
export interface FormattedError {
  message: string;
  suggestion?: string;
  details?: string;
}

export interface ErrorContext {
  transaction?: string;
}

function formatNetworkError(error: Error): FormattedError | null {
  if (error.message.includes('ECONNREFUSED')) {
    return {
      message: 'Connection refused',
      suggestion: 'Check your internet connection and try again',
      details: error.message,
    };
  }
  if (error.message.includes('ETIMEDOUT')) {
    return {
      message: 'Request timed out',
      suggestion: 'Check your internet connection and try again',
      details: error.message,
    };
  }
  return null;
}

/** Format an import-pipeline error into a user-friendly message + optional suggestion. */
export function formatImportError(error: unknown, context: ErrorContext = {}): FormattedError {
  if (error instanceof SyntaxError && error.message.includes('JSON')) {
    return {
      message: 'Invalid AI response format',
      suggestion: 'This is a temporary API issue. Try again or manually categorize.',
      details: error.message,
    };
  }

  if (error instanceof Error) {
    const network = formatNetworkError(error);
    if (network) return network;
  }

  return {
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    details: context.transaction,
  };
}
