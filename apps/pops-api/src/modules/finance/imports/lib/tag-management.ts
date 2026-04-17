import { and, eq, isNotNull, ne } from 'drizzle-orm';

import { tagVocabulary, transactions } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { suggestTags } from '../../../../shared/tag-suggester.js';

import type { SuggestedTag } from '../types.js';

/** Parse a JSON-encoded tags string from the corrections table into a string array. */
export function parseCorrectionTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === 'string');
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Load the flat list of all tag strings currently in the transactions table.
 * Called once per import batch; passed into buildSuggestedTags to avoid
 * repeated identical queries for every transaction.
 */
export function loadKnownTags(): string[] {
  const db = getDrizzle();
  const rows = db
    .select({ tags: transactions.tags })
    .from(transactions)
    .where(and(isNotNull(transactions.tags), ne(transactions.tags, '[]')))
    .all();

  const seen = new Set<string>();

  const vocab = db
    .select({ tag: tagVocabulary.tag })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.isActive, true))
    .all();
  for (const row of vocab) {
    if (row.tag) seen.add(row.tag);
  }

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.tags) as unknown;
      if (Array.isArray(parsed)) {
        for (const t of parsed) {
          if (typeof t === 'string') seen.add(t);
        }
      }
    } catch {
      /* ignore malformed JSON */
    }
  }
  return Array.from(seen);
}

/**
 * Build the suggested tags for a single transaction with source attribution.
 *
 * Priority: rule > ai > entity.
 * - rule: tags from a matched correction rule
 * - ai:   AI-returned category if it matches a tag already in the database
 * - entity: tags from suggestTags() that weren't already attributed above
 *
 * The "ai" match is case-insensitive against tags returned by availableTags
 * (i.e. what's actually in the transactions table), so no hardcoded list.
 */
export function buildSuggestedTags(
  description: string,
  entityId: string | null,
  correctionTags: string[],
  aiCategory: string | null,
  knownTags: string[],
  correctionPattern?: string
): SuggestedTag[] {
  return suggestTags({
    description,
    entityId,
    aiCategory,
    knownTags,
    correctionTags,
    correctionPattern,
  });
}
