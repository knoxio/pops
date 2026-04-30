/**
 * Error formatting helpers for user-friendly error messages.
 *
 * Converts technical errors into actionable messages with suggestions.
 */
import { AiCategorizationError } from '../modules/finance/imports/lib/ai-categorizer.js';

export interface FormattedError {
  message: string;
  suggestion?: string;
  details?: string;
}

export interface ErrorContext {
  transaction?: string;
}

function formatAiCategorizationError(error: AiCategorizationError): FormattedError | null {
  if (error.code === 'NO_API_KEY') {
    return {
      message: 'AI categorization unavailable',
      suggestion: 'Add ANTHROPIC_API_KEY to .env file',
      details:
        'AI categorization requires an Anthropic API key. See docs/SETUP.md for instructions.',
    };
  }
  if (error.code === 'INSUFFICIENT_CREDITS') {
    return {
      message: 'AI API credits exhausted',
      suggestion: 'Add credits at console.anthropic.com/settings/plans',
      details: error.message,
    };
  }
  if (error.code === 'API_ERROR') {
    return {
      message: 'AI categorization failed',
      suggestion:
        'This may be a temporary API issue. Try again or manually categorize the transaction.',
      details: error.message,
    };
  }
  return null;
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

/**
 * Format import-related errors with user-friendly messages and actionable suggestions.
 */
export function formatImportError(error: unknown, context: ErrorContext = {}): FormattedError {
  if (error instanceof AiCategorizationError) {
    const formatted = formatAiCategorizationError(error);
    if (formatted) return formatted;
  }

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
