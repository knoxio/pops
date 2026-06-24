/**
 * Glia data-access for the cerebrum pillar (trust-graduation).
 *
 * Scope boundary: this file is the SQL seam for the glia slice. It covers
 * CRUD on `glia_actions` plus seed / read / update on `glia_trust_state`
 * and a handful of window/count helpers the digest + trust machine
 * depend on. The trust-graduation orchestration (phase transitions,
 * demotion windows, threshold reads from `engrams/.config/glia.toml` +
 * settings DB), the in-process dispatch (`GliaActionService.executeAction`
 * callbacks, cross-pillar SDK writes), the scheduled digest renderer and
 * channel filesystem layout live in the pillar's glia module — this stays
 * pure data-access (no node:fs, no zod, no domain orchestration).
 *
 * Functions take a `CerebrumDb` handle as their first argument; the caller
 * resolves the singleton or transaction handle. Mirrors the
 * `nudge-log.ts` / `engrams.ts` db-arg pattern in this slice.
 */
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';

import { gliaActions, gliaTrustState } from '../schema.js';
import { rowToGliaAction, rowToGliaTrustState } from './glia-helpers.js';

import type {
  ActionListFilters,
  ActionType,
  GliaAction,
  GliaTrustState,
  InsertActionRow,
  ListActionsResult,
  SeedTrustStateRow,
  UpdateActionPatch,
  UpdateTrustStatePatch,
} from './glia-types.js';
import type { CerebrumDb } from './internal.js';

export { rowToGliaAction, rowToGliaTrustState };

/** Fetch a single action by id. Returns null when missing. */
export function getAction(db: CerebrumDb, id: string): GliaAction | null {
  const row = db.select().from(gliaActions).where(eq(gliaActions.id, id)).get();
  return row ? rowToGliaAction(row) : null;
}

/**
 * Paginated list of actions matching the supplied filters. Orders by
 * `created_at desc` so the most recent proposals surface first. Returns
 * both the rows and the unpaginated `total` so the caller can drive a
 * paging UI without a second round-trip.
 */
export function listActions(db: CerebrumDb, filters: ActionListFilters = {}): ListActionsResult {
  const conditions = [];
  if (filters.actionType) conditions.push(eq(gliaActions.actionType, filters.actionType));
  if (filters.status) conditions.push(eq(gliaActions.status, filters.status));
  if (filters.dateFrom) conditions.push(gte(gliaActions.createdAt, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(gliaActions.createdAt, filters.dateTo));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const rows = db
    .select()
    .from(gliaActions)
    .where(where)
    .orderBy(desc(gliaActions.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const [totalRow] = db.select({ total: count() }).from(gliaActions).where(where).all();

  return {
    actions: rows.map(rowToGliaAction),
    total: totalRow?.total ?? 0,
  };
}

/**
 * Insert a fully-formed `glia_actions` row. The caller is expected to have
 * generated the id and resolved phase/status/executedAt according to the
 * trust machine's rules; this function only serialises and writes.
 */
export function insertAction(db: CerebrumDb, row: InsertActionRow): GliaAction {
  const values = {
    id: row.id,
    actionType: row.actionType,
    affectedIds: JSON.stringify([...row.affectedIds]),
    rationale: row.rationale,
    payload: row.payload != null ? JSON.stringify(row.payload) : null,
    phase: row.phase,
    status: row.status,
    userDecision: null,
    userNote: null,
    executedAt: row.executedAt,
    decidedAt: null,
    revertedAt: null,
    createdAt: row.createdAt,
  };
  db.insert(gliaActions).values(values).run();
  return rowToGliaAction(values);
}

/**
 * Apply a lifecycle patch to an action. Returns the resulting row or null
 * if the action no longer exists. The patch shape is intentionally narrow:
 * only columns that mutate over an action's lifecycle (status + the four
 * timestamp/decision columns) can be set. Identity columns and the
 * payload are immutable post-insert.
 */
export function updateAction(
  db: CerebrumDb,
  id: string,
  patch: UpdateActionPatch
): GliaAction | null {
  if (Object.keys(patch).length === 0) return getAction(db, id);
  db.update(gliaActions).set(patch).where(eq(gliaActions.id, id)).run();
  return getAction(db, id);
}

/**
 * Hard-delete an action row. Returns the number of rows actually deleted
 * (0 if `id` was already gone — caller can treat this as idempotent).
 * Trust-state counters are intentionally NOT decremented; counters track
 * lifetime decisions, not active rows, and reverts are modelled via
 * status transitions rather than deletions.
 */
export function deleteAction(db: CerebrumDb, id: string): number {
  return db.delete(gliaActions).where(eq(gliaActions.id, id)).run().changes;
}

/**
 * Autonomous actions executed in `[startDate, endDate)`. Filters out rows
 * with a user decision so only worker-executed actions surface in the
 * digest. Window is matched against `executed_at` because `created_at`
 * could be earlier than execution for delayed worker runs; the end bound
 * is exclusive so a row pinned on the boundary can't appear in two
 * consecutive digests.
 */
export function listAutonomousActionsInWindow(
  db: CerebrumDb,
  startDate: string,
  endDate: string
): GliaAction[] {
  const rows = db
    .select()
    .from(gliaActions)
    .where(
      and(
        eq(gliaActions.status, 'executed'),
        isNull(gliaActions.decidedAt),
        gte(gliaActions.executedAt, startDate),
        lt(gliaActions.executedAt, endDate)
      )
    )
    .orderBy(asc(gliaActions.executedAt))
    .all();
  return rows.map(rowToGliaAction);
}

/**
 * Count autonomous actions still in `executed` status for an action type
 * since `sinceIso`. Excludes reverted rows so the digest can compute the
 * rejection rate as `reverted / (executed + reverted)` without
 * double-counting actions that have already been rolled back.
 */
export function countAutonomousExecutionsSince(
  db: CerebrumDb,
  actionType: ActionType,
  sinceIso: string
): number {
  const row = db
    .select({ total: count() })
    .from(gliaActions)
    .where(
      and(
        eq(gliaActions.actionType, actionType),
        eq(gliaActions.status, 'executed'),
        isNull(gliaActions.decidedAt),
        gte(gliaActions.executedAt, sinceIso)
      )
    )
    .get();
  return row?.total ?? 0;
}

/**
 * Count autonomous reverts for an action type since `sinceIso`. The
 * `isNotNull(revertedAt)` guard makes intent explicit: a row with
 * `status='reverted'` but null `reverted_at` is excluded by design rather
 * than by SQL accident.
 */
export function countAutonomousRevertsSince(
  db: CerebrumDb,
  actionType: ActionType,
  sinceIso: string
): number {
  const row = db
    .select({ total: count() })
    .from(gliaActions)
    .where(
      and(
        eq(gliaActions.actionType, actionType),
        eq(gliaActions.status, 'reverted'),
        isNull(gliaActions.decidedAt),
        isNotNull(gliaActions.revertedAt),
        gte(gliaActions.revertedAt, sinceIso)
      )
    )
    .get();
  return row?.total ?? 0;
}

/**
 * Count reverts within a rolling window for an action type. Used by the
 * trust machine's demotion check (2+ reverts in 7 days → demote).
 */
export function countRevertsInWindow(
  db: CerebrumDb,
  actionType: ActionType,
  windowStart: string
): number {
  const row = db
    .select({ total: count() })
    .from(gliaActions)
    .where(
      and(
        eq(gliaActions.actionType, actionType),
        eq(gliaActions.status, 'reverted'),
        gte(gliaActions.revertedAt, windowStart)
      )
    )
    .get();
  return row?.total ?? 0;
}

/**
 * Fetch trust state for a single action type. Returns null when the row
 * has not been seeded yet — the caller decides whether to surface that as
 * an error or to seed lazily.
 */
export function getTrustState(db: CerebrumDb, actionType: ActionType): GliaTrustState | null {
  const row = db
    .select()
    .from(gliaTrustState)
    .where(eq(gliaTrustState.actionType, actionType))
    .get();
  return row ? rowToGliaTrustState(row) : null;
}

/** List every seeded trust-state row. */
export function listTrustStates(db: CerebrumDb): GliaTrustState[] {
  return db.select().from(gliaTrustState).all().map(rowToGliaTrustState);
}

/**
 * Seed a trust-state row idempotently. Re-seeding an existing row is a
 * no-op (via `onConflictDoNothing`) so callers can call this on every
 * boot without clobbering counters that have already drifted from zero.
 */
export function seedTrustState(db: CerebrumDb, row: SeedTrustStateRow): void {
  db.insert(gliaTrustState).values(row).onConflictDoNothing().run();
}

/**
 * Apply a patch to a trust-state row. Returns the resulting row or null if
 * the action type has not been seeded. `updatedAt` is required on the
 * patch so the caller is forced to think about which clock to use; the
 * service intentionally does not call `new Date()` itself.
 */
export function updateTrustState(
  db: CerebrumDb,
  actionType: ActionType,
  patch: UpdateTrustStatePatch
): GliaTrustState | null {
  db.update(gliaTrustState).set(patch).where(eq(gliaTrustState.actionType, actionType)).run();
  return getTrustState(db, actionType);
}

/**
 * Increment one of the trust-state counters atomically and bump
 * `updatedAt`. The decide/revert paths use this where the counter delta
 * and the corresponding action update need to land in the same logical
 * write; the caller wraps both writes in a single transaction.
 */
export function incrementTrustStateCounter(
  db: CerebrumDb,
  actionType: ActionType,
  counter: 'approvedCount' | 'rejectedCount' | 'revertedCount',
  updatedAt: string
): void {
  const column = gliaTrustState[counter];
  db.update(gliaTrustState)
    .set({ [counter]: sql`${column} + 1`, updatedAt })
    .where(eq(gliaTrustState.actionType, actionType))
    .run();
}
