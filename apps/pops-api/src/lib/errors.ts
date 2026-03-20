/**
 * Error formatting helpers for user-friendly error messages.
 *
 * Converts technical errors into actionable messages with suggestions.
 */
import { AiCategorizationError } from "../modules/finance/imports/lib/ai-categorizer.js";

export interface FormattedError {
  message: string;
  suggestion?: string;
  details?: string;
}

export interface ErrorContext {
  transaction?: string;
}

/**
 * Format import-related errors with user-friendly messages and actionable suggestions.
 */
export function formatImportError(error: unknown, context: ErrorContext = {}): FormattedError {
  // AI categorization errors
  if (error instanceof AiCategorizationError) {
    if (error.code === "NO_API_KEY") {
      return {
        message: "AI categorization unavailable",
        suggestion: "Add CLAUDE_API_KEY to .env file",
        details:
          "AI categorization requires an Anthropic API key. See docs/SETUP.md for instructions.",
      };
    }
    if (error.code === "INSUFFICIENT_CREDITS") {
      return {
        message: "AI API credits exhausted",
        suggestion: "Add credits at console.anthropic.com/settings/plans",
        details: error.message,
      };
    }
    if (error.code === "API_ERROR") {
      return {
        message: "AI categorization failed",
        suggestion:
          "This may be a temporary API issue. Try again or manually categorize the transaction.",
        details: error.message,
      };
    }
  }

  // JSON parse errors (shouldn't happen with markdown stripping, but keep as fallback)
  if (error instanceof SyntaxError && error.message.includes("JSON")) {
    return {
      message: "Invalid AI response format",
      suggestion: "This is a temporary API issue. Try again or manually categorize.",
      details: error.message,
    };
  }

  // Network errors
  if (error instanceof Error && error.message.includes("ECONNREFUSED")) {
    return {
      message: "Connection refused",
      suggestion: "Check your internet connection and try again",
      details: error.message,
    };
  }

  if (error instanceof Error && error.message.includes("ETIMEDOUT")) {
    return {
      message: "Request timed out",
      suggestion: "Check your internet connection and try again",
      details: error.message,
    };
  }

  // Generic error
  return {
    message: error instanceof Error ? error.message : "Unknown error occurred",
    details: context.transaction,
  };
}
