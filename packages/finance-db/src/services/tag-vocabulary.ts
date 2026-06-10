/**
 * Tag vocabulary persistence for the finance domain.
 *
 * The `tag_vocabulary` table is the canonical set of tags the user (or
 * the seed data) considers valid for tagging transactions. Reads list
 * the active tags; writes upsert a single tag and reactivate it if it
 * had been soft-deleted.
 *
 * The in-tree service in `apps/pops-api/src/modules/core/tag-rules/vocabulary.ts`
 * still uses `getDrizzle()`; this package version takes a `FinanceDb`
 * handle as its first argument. The cutover (PR 3 of phase 1) flips
 * the router to call into here.
 *
 * Mirrors the wish-list pattern: db-arg services, plain functions, no
 * HTTP or tRPC concerns. No typed errors are exported because neither
 * function has a not-found path — listing an empty vocabulary returns
 * `[]` and upsert is idempotent.
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
 * Order matches the legacy in-tree implementation — no explicit ORDER BY,
 * so SQLite returns rows in storage order. The router treats the result
 * as a set so order is not observable to clients, but preserving the
 * legacy shape keeps the cutover (PR 3) a pure routing flip.
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
