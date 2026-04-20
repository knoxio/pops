/**
 * Structured query parser — extracts typed filter tokens from search input.
 *
 * Supported filters:
 *   type:<value>     — entity/content type
 *   domain:<value>   — search domain
 *   year:>N, year:<N — year range
 *   value:>N, value:<N — value range
 *   warranty:expiring — warranty status
 *
 * Unrecognised key:value tokens are treated as plain text.
 */
import type { Query, StructuredFilter } from './types.js';

const KNOWN_KEYS = new Set(['type', 'domain', 'year', 'value', 'warranty']);

/**
 * Matches tokens like `key:value`, `key:>value`, `key:<value`.
 * Captures: key, optional operator (> or <), value (no spaces).
 */
const FILTER_PATTERN = /(\w+):([><]?)(\S+)/g;

export function parseQuery(input: string): Query {
  const filters: StructuredFilter[] = [];
  const textParts: string[] = [];

  // Split by whitespace, process each token
  const tokens = input.trim().split(/\s+/);

  for (const token of tokens) {
    if (!token) continue;

    // Reset regex state
    FILTER_PATTERN.lastIndex = 0;
    const match = FILTER_PATTERN.exec(token);

    if (match && match.index === 0 && match[0] === token && KNOWN_KEYS.has(match[1] ?? '')) {
      const key = match[1] ?? '';
      const operator = match[2] ?? '';
      const value = match[3] ?? '';
      filters.push({ key, value: `${operator}${value}` });
    } else {
      textParts.push(token);
    }
  }

  return {
    text: textParts.join(' '),
    filters: filters.length > 0 ? filters : undefined,
  };
}
