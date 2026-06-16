/**
 * Tag-loading + suggestion glue for the import pipeline.
 *
 * Ported from the monolith `lib/tag-management.ts`, db-injected: `loadKnownTags`
 * takes a `FinanceDb` handle and `buildSuggestedTags` forwards to the pillar's
 * own `suggestTags` (which also takes the handle).
 */
import { and, eq, isNotNull, ne } from 'drizzle-orm';

import { type FinanceDb, tagVocabulary, transactions } from '../../../db/index.js';
import { suggestTags, type SuggestedTag } from '../tag-suggester/index.js';

function addTagsToSet(target: Set<string>, raw: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(parsed)) return;
  for (const t of parsed) {
    if (typeof t === 'string') target.add(t);
  }
}

/**
 * Load the flat list of every tag currently in use — the active tag vocabulary
 * plus every distinct tag on a stored transaction. Called once per import batch
 * and threaded into `buildSuggestedTags` so AI/category validation has the full
 * vocabulary without re-querying per transaction.
 */
export function loadKnownTags(db: FinanceDb): string[] {
  const seen = new Set<string>();

  const vocab = db
    .select({ tag: tagVocabulary.tag })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.isActive, true))
    .all();
  for (const row of vocab) {
    if (row.tag) seen.add(row.tag);
  }

  const rows = db
    .select({ tags: transactions.tags })
    .from(transactions)
    .where(and(isNotNull(transactions.tags), ne(transactions.tags, '[]')))
    .all();
  for (const row of rows) {
    if (row.tags) addTagsToSet(seen, row.tags);
  }

  return Array.from(seen);
}

export interface BuildSuggestedTagsOptions {
  description: string;
  entityId: string | null;
  correctionTags: string[];
  aiTags?: string[];
  aiCategory: string | null;
  knownTags: string[];
  correctionPattern?: string;
}

/**
 * Build the suggested tags for a single transaction with source attribution
 * (rule > ai > entity). Thin pass-through to the pillar's `suggestTags`.
 */
export function buildSuggestedTags(db: FinanceDb, opts: BuildSuggestedTagsOptions): SuggestedTag[] {
  return suggestTags(db, {
    description: opts.description,
    entityId: opts.entityId,
    aiTags: opts.aiTags,
    aiCategory: opts.aiCategory,
    knownTags: opts.knownTags,
    correctionTags: opts.correctionTags,
    correctionPattern: opts.correctionPattern,
  });
}
