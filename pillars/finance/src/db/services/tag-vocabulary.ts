/**
 * Tag vocabulary persistence for the finance domain.
 *
 * The `tag_vocabulary` table holds the canonical set of tags that the user (or
 * the seed data) considers valid for tagging transactions. `listVocabularyTags`
 * returns the active tags; `upsertVocabularyTag` inserts a tag or reactivates
 * one that had been soft-deleted.
 *
 * Standard service pattern: db-arg services, plain functions, no HTTP concerns.
 * No typed errors are exported because neither function has a not-found path —
 * an empty vocabulary returns `[]` and upsert is idempotent.
 */
import { eq } from 'drizzle-orm';

import { tagVocabulary } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for callers that need the full record. */
export type TagVocabularyRow = typeof tagVocabulary.$inferSelect;

/** Source field discriminant — matches the schema enum. */
export type TagVocabularySource = 'seed' | 'user';

/**
 * Return the active vocabulary tags.
 *
 * No explicit ORDER BY — SQLite makes no ordering guarantee in that case. The
 * router treats the result as a set, so order is not observable to clients.
 */
export function listVocabularyTags(db: FinanceDb): string[] {
  return db
    .select({ tag: tagVocabulary.tag })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.isActive, true))
    .all()
    .map((row) => row.tag);
}

/**
 * Upsert a tag into the vocabulary, marking it active.
 *
 * On insert the row gets `(tag, source, isActive=true)` with the
 * default `created_at`. On conflict (same `tag` PK) the existing row's
 * `isActive` is flipped back to true — the `source` is left untouched
 * so a seed tag re-added by a user keeps its `seed` provenance.
 */
export function upsertVocabularyTag(db: FinanceDb, tag: string, source: TagVocabularySource): void {
  db.insert(tagVocabulary)
    .values({ tag, source, isActive: true })
    .onConflictDoUpdate({
      target: tagVocabulary.tag,
      set: { isActive: true },
    })
    .run();
}
