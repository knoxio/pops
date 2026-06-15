/**
 * Shared row helpers for the `cerebrum.debrief.*` procedures.
 *
 * Lives one level above `procedures/` so both the read and write
 * modules can reuse `findSessionById` /
 * `createOrReplacePendingSession` without a circular import.
 */
import { TRPCError } from '@trpc/server';
import { and, eq, inArray } from 'drizzle-orm';

import { DebriefSessionSchema } from '@pops/cerebrum-contract/schemas';
import { debriefSessions } from '@pops/cerebrum-db';

import type { CerebrumDb } from '@pops/cerebrum-db';

import type { DebriefSession, DebriefSessionRow } from './schemas.js';

export function findSessionById(db: CerebrumDb, sessionId: number): DebriefSessionRow | undefined {
  return db.select().from(debriefSessions).where(eq(debriefSessions.id, sessionId)).get();
}

/**
 * Delete any prior pending/active session for the given media tuple,
 * then insert a fresh pending session. Matches the legacy
 * `createDebriefSession` idempotency contract: re-running it for the
 * same `(mediaType, mediaId)` converges on exactly one pending row.
 *
 * Wrapped by both `create` and `logWatchCompletion`.
 */
export function createOrReplacePendingSession(
  db: CerebrumDb,
  input: { watchHistoryId: number; mediaType: 'movie' | 'episode'; mediaId: number }
): DebriefSession {
  const row = db.transaction((tx) => {
    tx.delete(debriefSessions)
      .where(
        and(
          eq(debriefSessions.mediaType, input.mediaType),
          eq(debriefSessions.mediaId, input.mediaId),
          inArray(debriefSessions.status, ['pending', 'active'])
        )
      )
      .run();

    const insertResult = tx
      .insert(debriefSessions)
      .values({
        watchHistoryId: input.watchHistoryId,
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        status: 'pending',
      })
      .run();

    const insertedId = Number(insertResult.lastInsertRowid);
    const session = tx
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.id, insertedId))
      .get();
    if (!session) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to read back debrief session ${insertedId} after insert`,
      });
    }
    return session;
  });
  return DebriefSessionSchema.parse(row);
}
