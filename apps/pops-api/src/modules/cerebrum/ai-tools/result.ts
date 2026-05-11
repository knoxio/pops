/**
 * Platform-neutral result helpers for cerebrum AI tool handlers (PRD-101 US-10).
 *
 * Handlers return `AiToolResult` (the contract defined in `@pops/types`), not
 * the MCP-SDK `CallToolResult`. The MCP dispatcher (see
 * `apps/pops-api/src/mcp/tools/index.ts`) wraps an `AiToolResult` into a
 * `CallToolResult` for the SDK; Ego consumes the platform-neutral shape
 * directly. Keeping these helpers inside the cerebrum module ensures the
 * module owns its AI tool surface without importing from `mcp/`.
 */
import { logger } from '../../../lib/logger.js';
import { NotFoundError, ValidationError } from '../../../shared/errors.js';

import type { AiToolResult } from '@pops/types';

/** Canonical error codes surfaced by cerebrum AI tools. */
export type CerebrumToolErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'SCOPE_BLOCKED'
  | 'INTERNAL_ERROR';

/** Build a successful tool result from a JSON-serialisable payload. */
export function toolSuccess(payload: unknown): AiToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

/** Build a tool error result with a canonical error code. */
export function toolError(message: string, code: CerebrumToolErrorCode): AiToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, code }) }],
    isError: true,
  };
}

/**
 * Map a thrown service-layer error to a tool error result.
 *
 * Known typed errors (`NotFoundError`, `ValidationError`) carry caller-safe
 * messages and are surfaced as-is. Anything else is treated as an unexpected
 * internal failure: the original error is logged server-side for diagnosis and
 * the caller receives a generic message so we never leak stack traces, SQL
 * fragments, or other internals through MCP / Ego responses.
 */
/**
 * Pull a human-readable message out of a ValidationError's `details` payload.
 *
 * The service layer throws `new ValidationError({ message: '<reason>' })` so
 * the field-level reason lives inside `details`, not in the top-level
 * `Error.message` (which is always "Validation failed"). The MCP / Ego
 * surface needs the actual reason, otherwise agents and humans see
 * indistinguishable generic strings for every validation failure.
 */
function extractValidationMessage(err: ValidationError): string {
  const details = err.details;
  if (typeof details === 'string' && details.trim().length > 0) {
    return details;
  }
  if (
    typeof details === 'object' &&
    details !== null &&
    typeof (details as { message?: unknown }).message === 'string'
  ) {
    const message = (details as { message: string }).message;
    if (message.trim().length > 0) return message;
  }
  return err.message;
}

export function mapServiceError(err: unknown): AiToolResult {
  if (err instanceof NotFoundError) {
    return toolError(err.message, 'NOT_FOUND');
  }
  if (err instanceof ValidationError) {
    return toolError(extractValidationMessage(err), 'VALIDATION_ERROR');
  }
  logger.error({ err }, '[cerebrum.ai-tools] unhandled service error');
  return toolError('An unexpected internal error occurred', 'INTERNAL_ERROR');
}
