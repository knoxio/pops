/**
 * Read the Anthropic API key for provider health checks.
 *
 * Reads `ANTHROPIC_API_KEY` first; falls back to the deprecated
 * `CLAUDE_API_KEY` with a one-time deprecation warning so operators know
 * to rename the secret.
 */
import { logger } from './logger.js';

/** Guards the deprecation warning to once per process (provider health checks
 * call this repeatedly, so an unguarded warn would spam the logs). */
let warnedLegacyKey = false;

export function getAnthropicApiKey(): string {
  const anthropic = process.env['ANTHROPIC_API_KEY'];
  const legacy = process.env['CLAUDE_API_KEY'];
  const key = anthropic ?? legacy;
  if (!key) return '';
  if (!anthropic && legacy && !warnedLegacyKey) {
    warnedLegacyKey = true;
    logger.warn('CLAUDE_API_KEY is deprecated — rename to ANTHROPIC_API_KEY in your .env');
  }
  return key;
}
