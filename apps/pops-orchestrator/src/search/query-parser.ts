/**
 * Structured query parser — extracts typed filter tokens from search input.
 *
 * Relocated verbatim from the monolith engine
 * (`apps/pops-api/src/modules/core/search/query-parser.ts`) so the
 * orchestrator parses the user's raw input the same way the in-process engine
 * did before federation.
 *
 * Supported filters:
 *   type:<value>     — entity/content type
 *   domain:<value>   — search domain
 *   year:>N, year:<N — year range
 *   value:>N, value:<N — value range
 *   warranty:expiring — warranty status
 *
 * Unrecognised key:value tokens are treated as plain text.
 *
 * Note: returns a `ParsedQuery` (orchestrator-local shape with `(key, value)`
 * filters) — distinct from the cross-package `Query` type whose
 * `StructuredFilter` uses `(field, operator, value)`. The engine narrows the
 * parsed value to a `Query` (text-only today) before fan-out.
 */
import type { ParsedFilter } from './types.js';

const KNOWN_KEYS = new Set(['type', 'domain', 'year', 'value', 'warranty']);

/**
 * Matches tokens like `key:value`, `key:>value`, `key:<value`.
 * Captures: key, optional operator (> or <), value (no spaces).
 */
const FILTER_PATTERN = /(\w+):([><]?)(\S+)/g;

export interface ParsedQuery {
  text: string;
  filters?: ParsedFilter[];
}

export function parseQuery(input: string): ParsedQuery {
  const filters: ParsedFilter[] = [];
  const textParts: string[] = [];

  const tokens = input.trim().split(/\s+/);

  for (const token of tokens) {
    if (!token) continue;

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
