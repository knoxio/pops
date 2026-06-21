/**
 * Read the Anthropic API key for provider health checks.
 *
 * Reads `ANTHROPIC_API_KEY` first; falls back to the deprecated
 * `CLAUDE_API_KEY` with a one-time deprecation warning so operators know
 * to rename the secret.
 */
import { logger } from './logger.js';

export function getAnthropicApiKey(): string {
  const anthropic = process.env['ANTHROPIC_API_KEY'];
  const legacy = process.env['CLAUDE_API_KEY'];
  const key = anthropic ?? legacy;
  if (!key) return '';
  if (!anthropic && legacy) {
    logger.warn('CLAUDE_API_KEY is deprecated — rename to ANTHROPIC_API_KEY in your .env');
  }
  return key;
}
