import { eq } from 'drizzle-orm';

import { tagVocabulary } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';

export function listVocabulary(): string[] {
  const db = getDrizzle();
  return db
    .select({ tag: tagVocabulary.tag })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.isActive, true))
    .all()
    .map((r) => r.tag);
}

export function upsertVocabularyTag(tag: string, source: 'seed' | 'user'): void {
  const db = getDrizzle();
  db.insert(tagVocabulary)
    .values({ tag, source, isActive: true })
    .onConflictDoUpdate({
      target: tagVocabulary.tag,
      set: { isActive: true },
    })
    .run();
}
