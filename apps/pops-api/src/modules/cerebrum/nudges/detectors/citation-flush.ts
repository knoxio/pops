/**
 * Citation flush — persists in-memory citation counts to the database.
 *
 * Separated from citation-tracker.ts to avoid pulling @pops/db-types
 * into the staleness detector import chain (which breaks test isolation).
 */
import { eq } from 'drizzle-orm';

import { engramIndex } from '@pops/db-types';

import { getAllCitationCounts, resetCitationCounts } from './citation-tracker.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/**
 * Flush citation counts to the database, updating the modifiedAt
 * timestamp to reflect recent usage. This reduces staleness scores
 * for frequently-cited engrams.
 */
export function flushCitationsToDb(db: BetterSQLite3Database): number {
  let flushed = 0;
  const now = new Date().toISOString();
  const counts = getAllCitationCounts();

  for (const [engramId, count] of counts) {
    if (count === 0) continue;
    try {
      db.update(engramIndex).set({ modifiedAt: now }).where(eq(engramIndex.id, engramId)).run();
      flushed++;
    } catch {
      // Engram may have been deleted — skip silently
    }
  }

  resetCitationCounts();
  return flushed;
}
