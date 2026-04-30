/**
 * Shared helper for reading the Anthropic API key.
 *
 * Reads ANTHROPIC_API_KEY first; falls back to the deprecated CLAUDE_API_KEY
 * with a one-time deprecation warning so operators know to rename the secret.
 */
import { getEnv } from '../env.js';
import { logger } from './logger.js';

export function getAnthropicApiKey(): string {
  const key = getEnv('ANTHROPIC_API_KEY') ?? getEnv('CLAUDE_API_KEY');
  if (!key) return '';
  if (!getEnv('ANTHROPIC_API_KEY') && getEnv('CLAUDE_API_KEY')) {
    logger.warn('CLAUDE_API_KEY is deprecated — rename to ANTHROPIC_API_KEY in your .env');
  }
  return key;
}
