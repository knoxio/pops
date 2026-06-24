/**
 * Public entity + input types for the `cerebrum.debrief.*` SDK surface. The
 * cerebrum debrief subsystem is consumed cross-pillar by the media pillar
 * after a watch lands; it stores a post-watch reflection session per
 * (re-)watch, queues a per-dimension status row, and records per-dimension
 * reflection outcomes.
 *
 * Shapes mirror the drizzle rows under `src/db` (`debriefSessions`,
 * `debriefResults`, `debriefStatus`) one-to-one — the contract is the wire
 * shape, not a UI projection. The accompanying zod schemas under
 * `../schemas/debrief.ts` validate at runtime; the round-trip test in
 * `__tests__/schemas.test.ts` keeps both halves in lock-step.
 *
 * `getByMedia` consumes the denormalised `media_type` + `media_id` columns
 * on `debrief_sessions` — no SQL inner-join into `watch_history` leaks into
 * the cross-pillar read.
 */

export const DEBRIEF_MEDIA_TYPES = ['movie', 'episode'] as const;
export type DebriefMediaType = (typeof DEBRIEF_MEDIA_TYPES)[number];

export const DEBRIEF_SESSION_STATUSES = ['pending', 'active', 'complete'] as const;
export type DebriefSessionStatus = (typeof DEBRIEF_SESSION_STATUSES)[number];

/**
 * A single post-watch debrief session — one row per (re-)watch.
 *
 * `mediaType` / `mediaId` are the denormalised media tuple; both are
 * nullable in the drizzle definition, so the contract surfaces both as
 * nullable.
 *
 * `watchHistoryId` is a soft pointer into the media pillar's
 * `watch_history` table (ADR-026); no cross-DB FK exists.
 */
export interface DebriefSession {
  id: number;
  watchHistoryId: number;
  mediaType: DebriefMediaType | null;
  mediaId: number | null;
  status: DebriefSessionStatus;
  /** ISO-8601 timestamp emitted by sqlite `(datetime('now'))`. */
  createdAt: string;
}

/**
 * A per-session, per-dimension reflection outcome. `comparisonId` is null
 * when the dimension was dismissed (skipped); otherwise it pins the
 * comparison row recorded for the dimension.
 */
export interface DebriefResult {
  id: number;
  sessionId: number;
  dimensionId: number;
  comparisonId: number | null;
  /** ISO-8601 timestamp. */
  createdAt: string;
}

/**
 * Per (media tuple, dimension) row tracking whether the debrief flow for a
 * dimension has been completed or dismissed. Upserted by
 * `queueDebriefStatus` — `debriefed` / `dismissed` reset to 0 on re-watch.
 */
export interface DebriefStatus {
  id: number;
  mediaType: string;
  mediaId: number;
  dimensionId: number;
  debriefed: number;
  dismissed: number;
  /** ISO-8601 timestamp. */
  createdAt: string;
  /** ISO-8601 timestamp. */
  updatedAt: string;
}

/**
 * Input for `cerebrum.debrief.record` — insert a debrief result row.
 * `comparisonId` is null when the dimension is being recorded as a skip.
 */
export interface RecordInput {
  sessionId: number;
  dimensionId: number;
  comparisonId: number | null;
}

/**
 * Input for `cerebrum.debrief.dismiss` — mark a session as dismissed at
 * the session level. Idempotent on already-dismissed sessions.
 */
export interface DismissInput {
  sessionId: number;
}

/**
 * Input for `cerebrum.debrief.listPending` — enumerate pending sessions,
 * optionally filtered by media tuple. Pagination defaults are picked by
 * the handler; the contract just shapes the optional knobs.
 */
export interface ListPendingInput {
  mediaType?: DebriefMediaType;
  mediaId?: number;
  limit?: number;
  offset?: number;
}

/**
 * Input for `cerebrum.debrief.create` — create a debrief session pinned to
 * a watch_history row. Deletes prior pending/active sessions for the same
 * `(mediaType, mediaId)` first; matches today's `createDebriefSession`
 * idempotency.
 */
export interface CreateInput {
  watchHistoryId: number;
  mediaType: DebriefMediaType;
  mediaId: number;
}

/** Input for `cerebrum.debrief.get`. */
export interface GetInput {
  sessionId: number;
}

/**
 * Input for `cerebrum.debrief.getByMedia` — denormalised lookup. Reads
 * `debrief_sessions.media_type` + `media_id` directly; no inner-join into
 * `watch_history`. Returns `null` when no session exists.
 */
export interface GetByMediaInput {
  mediaType: DebriefMediaType;
  mediaId: number;
}

/**
 * Input for `cerebrum.debrief.logWatchCompletion` — wraps
 * `createDebriefSession` + `queueDebriefStatus` in one cerebrum-side tx;
 * idempotent on retry per `(watchHistoryId, mediaType, mediaId)`.
 */
export interface LogWatchCompletionInput {
  watchHistoryId: number;
  mediaType: DebriefMediaType;
  mediaId: number;
}

/**
 * Input for `cerebrum.debrief.deleteByWatchHistoryId` — cascade-delete
 * `debriefSessions` rows pinned to the given watch row. Sister
 * `debriefResults` rows cascade via the intra-cerebrum FK.
 */
export interface DeleteByWatchHistoryIdInput {
  watchHistoryId: number;
}
