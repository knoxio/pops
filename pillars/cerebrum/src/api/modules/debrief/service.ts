/**
 * Query layer for the `cerebrum.debrief.*` surface (PRD-248).
 *
 * Reads/writes `debrief_sessions` + `debrief_results` through a drizzle
 * handle. The media tuple, `watchHistoryId`, `dimensionId` and `comparisonId`
 * are soft pointers into the media pillar (ADR-026) — no cross-DB FK and no
 * cross-pillar call. `create` is idempotent (replaces any prior pending/active
 * session for the media tuple); `deleteByWatchHistoryId` cascades results then
 * sessions inside a single transaction.
 *
 * Rows are validated through the local wire schemas so the nullable-text
 * `media_type` column is narrowed to the wire enum at the boundary; a row that
 * fails validation surfaces as a thrown error rather than a silently widened
 * shape.
 */
import { and, desc, eq, inArray } from 'drizzle-orm';

import {
  debriefResultSchema,
  debriefSessionSchema,
  type DebriefMediaTypeWire,
  type DebriefResultWire,
  type DebriefSessionWire,
} from '../../../contract/rest-debrief-schemas.js';
import { type CerebrumDb, debriefResults, debriefSessions } from '../../../db/index.js';
import { NotFoundError } from '../../shared/errors.js';

const DEFAULT_LIST_PENDING_LIMIT = 50;

export interface CreateSessionInput {
  watchHistoryId: number;
  mediaType: DebriefMediaTypeWire;
  mediaId: number;
}

export interface RecordInput {
  sessionId: number;
  dimensionId: number;
  comparisonId: number | null;
}

export interface ListPendingInput {
  mediaType?: DebriefMediaTypeWire;
  mediaId?: number;
  limit?: number;
  offset?: number;
}

export interface ListPendingResult {
  data: DebriefSessionWire[];
  pagination: { limit: number; offset: number; total: number };
}

export interface DeleteByWatchHistoryResult {
  deletedSessions: number;
  deletedResults: number;
}

export interface DebriefService {
  get: (sessionId: number) => DebriefSessionWire | null;
  getByMedia: (mediaType: DebriefMediaTypeWire, mediaId: number) => DebriefSessionWire | null;
  listPending: (input: ListPendingInput) => ListPendingResult;
  record: (input: RecordInput) => DebriefResultWire;
  create: (input: CreateSessionInput) => DebriefSessionWire;
  dismiss: (sessionId: number) => DebriefSessionWire;
  deleteByWatchHistoryId: (watchHistoryId: number) => DeleteByWatchHistoryResult;
}

function findSessionRow(db: CerebrumDb, sessionId: number): DebriefSessionWire | null {
  const row = db.select().from(debriefSessions).where(eq(debriefSessions.id, sessionId)).get();
  return row ? debriefSessionSchema.parse(row) : null;
}

function createOrReplacePendingSession(
  db: CerebrumDb,
  input: CreateSessionInput
): DebriefSessionWire {
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
    const inserted = tx
      .insert(debriefSessions)
      .values({
        watchHistoryId: input.watchHistoryId,
        mediaType: input.mediaType,
        mediaId: input.mediaId,
        status: 'pending',
      })
      .run();
    const session = tx
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.id, Number(inserted.lastInsertRowid)))
      .get();
    if (!session) throw new Error('Failed to read back debrief session after insert');
    return session;
  });
  return debriefSessionSchema.parse(row);
}

export function createDebriefService(db: CerebrumDb): DebriefService {
  return {
    get: (sessionId) => findSessionRow(db, sessionId),

    getByMedia: (mediaType, mediaId) => {
      const row = db
        .select()
        .from(debriefSessions)
        .where(
          and(
            eq(debriefSessions.mediaType, mediaType),
            eq(debriefSessions.mediaId, mediaId),
            inArray(debriefSessions.status, ['pending', 'active'])
          )
        )
        .orderBy(desc(debriefSessions.createdAt), desc(debriefSessions.id))
        .get();
      return row ? debriefSessionSchema.parse(row) : null;
    },

    listPending: (input) => listPending(db, input),

    record: (input) => {
      if (!findSessionRow(db, input.sessionId)) {
        throw new NotFoundError('Debrief session', String(input.sessionId));
      }
      const inserted = db
        .insert(debriefResults)
        .values({
          sessionId: input.sessionId,
          dimensionId: input.dimensionId,
          comparisonId: input.comparisonId,
        })
        .run();
      const row = db
        .select()
        .from(debriefResults)
        .where(eq(debriefResults.id, Number(inserted.lastInsertRowid)))
        .get();
      if (!row) throw new Error('Failed to read back debrief result after insert');
      return debriefResultSchema.parse(row);
    },

    create: (input) => createOrReplacePendingSession(db, input),

    dismiss: (sessionId) => dismiss(db, sessionId),

    deleteByWatchHistoryId: (watchHistoryId) => deleteByWatchHistoryId(db, watchHistoryId),
  };
}

function listPending(db: CerebrumDb, input: ListPendingInput): ListPendingResult {
  const filters = [eq(debriefSessions.status, 'pending')];
  if (input.mediaType !== undefined) filters.push(eq(debriefSessions.mediaType, input.mediaType));
  if (input.mediaId !== undefined) filters.push(eq(debriefSessions.mediaId, input.mediaId));
  const whereClause = and(...filters);

  const limit = input.limit ?? DEFAULT_LIST_PENDING_LIMIT;
  const offset = input.offset ?? 0;

  const rows = db
    .select()
    .from(debriefSessions)
    .where(whereClause)
    .orderBy(desc(debriefSessions.createdAt), desc(debriefSessions.id))
    .limit(limit)
    .offset(offset)
    .all();
  const total = db
    .select({ id: debriefSessions.id })
    .from(debriefSessions)
    .where(whereClause)
    .all().length;

  return {
    data: rows.map((row) => debriefSessionSchema.parse(row)),
    pagination: { limit, offset, total },
  };
}

function dismiss(db: CerebrumDb, sessionId: number): DebriefSessionWire {
  const row = db.transaction((tx) => {
    const existing = tx
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.id, sessionId))
      .get();
    if (!existing) throw new NotFoundError('Debrief session', String(sessionId));
    if (existing.status === 'complete') return existing;
    tx.update(debriefSessions)
      .set({ status: 'complete' })
      .where(eq(debriefSessions.id, sessionId))
      .run();
    const updated = tx
      .select()
      .from(debriefSessions)
      .where(eq(debriefSessions.id, sessionId))
      .get();
    if (!updated) throw new Error('Failed to read back debrief session after dismiss');
    return updated;
  });
  return debriefSessionSchema.parse(row);
}

function deleteByWatchHistoryId(
  db: CerebrumDb,
  watchHistoryId: number
): DeleteByWatchHistoryResult {
  return db.transaction((tx) => {
    const sessionIds = tx
      .select({ id: debriefSessions.id })
      .from(debriefSessions)
      .where(eq(debriefSessions.watchHistoryId, watchHistoryId))
      .all()
      .map((row) => row.id);
    if (sessionIds.length === 0) return { deletedSessions: 0, deletedResults: 0 };

    const resultsDelete = tx
      .delete(debriefResults)
      .where(inArray(debriefResults.sessionId, sessionIds))
      .run();
    const sessionsDelete = tx
      .delete(debriefSessions)
      .where(eq(debriefSessions.watchHistoryId, watchHistoryId))
      .run();
    return {
      deletedSessions: Number(sessionsDelete.changes),
      deletedResults: Number(resultsDelete.changes),
    };
  });
}
