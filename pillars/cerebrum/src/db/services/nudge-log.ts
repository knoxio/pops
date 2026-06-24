/**
 * Nudge-log persistence (proactive-nudges).
 *
 * Audit-trail-style table the cerebrum reflex/nudge subsystem writes to
 * when a detector scan produces candidate nudges. The functions here
 * cover the persistence-layer surface the nudge subsystem needs:
 *
 *   - {@link createNudge} — insert one alert-driven nudge (no cooldown dedup).
 *   - {@link persistCandidates} — insert new nudges with cooldown dedup.
 *   - {@link listContradictions} — paginated read of contradiction-pattern
 *     nudges, with the SQL-side `json_extract` filter that prevents
 *     non-contradiction pattern nudges from consuming page slots or
 *     inflating `total`.
 *   - {@link enforcePendingCap} — quietly expire the oldest pending rows
 *     when the cap is exceeded.
 *
 * Functions take a `CerebrumDb` handle as their first argument; the caller
 * resolves the singleton or transaction handle. Follows the standard
 * per-slice db-arg service pattern.
 *
 * The cross-table read helper `loadActiveEngrams` (which the detector
 * scans depend on) lives in `engrams.ts`.
 */
import { and, count, eq, inArray, sql } from 'drizzle-orm';

import { nudgeLog } from '../schema.js';
import { generateNudgeId, rowToNudge } from './nudge-log-helpers.js';

import type { CerebrumDb } from './internal.js';
import type {
  Nudge,
  NudgeAction,
  NudgeCandidate,
  NudgePersistenceThresholds,
  NudgePriority,
  NudgeStatus,
  NudgeType,
} from './nudge-log-types.js';

/** Input for {@link createNudge} — a single alert-driven nudge insert. */
export interface CreateNudgeInput {
  type?: NudgeType;
  title: string;
  body: string;
  priority: NudgePriority;
  engramIds?: string[];
  expiresAt?: string | null;
  action?: NudgeAction | null;
}

/**
 * Insert exactly one nudge and return it as a {@link Nudge}.
 *
 * Unlike {@link persistCandidates}, this path applies NO cooldown dedup: the
 * caller (the ai-alerts pipeline) wants every alert to surface a row rather
 * than be silently swallowed by a same-type/same-engrams cooldown window.
 */
export function createNudge(
  db: CerebrumDb,
  input: CreateNudgeInput,
  now: () => Date = () => new Date()
): Nudge {
  const timestamp = now();
  const type = input.type ?? 'insight';
  const action = input.action ?? null;
  const id = generateNudgeId(type, timestamp);

  db.insert(nudgeLog)
    .values({
      id,
      type,
      title: input.title,
      body: input.body,
      engramIds: JSON.stringify(input.engramIds ?? []),
      priority: input.priority,
      status: 'pending',
      createdAt: timestamp.toISOString(),
      expiresAt: input.expiresAt ?? null,
      actionType: action?.type ?? null,
      actionLabel: action?.label ?? null,
      actionParams: action ? JSON.stringify(action.params) : null,
    })
    .run();

  const [row] = db.select().from(nudgeLog).where(eq(nudgeLog.id, id)).all();
  if (!row) throw new Error(`createNudge: inserted nudge '${id}' not found on read-back`);
  return rowToNudge(row);
}

/** Insert new nudges, skipping any whose (type, sorted engramIds) pair is
 * still inside the cooldown window. Returns the number created.
 */
export function persistCandidates(
  db: CerebrumDb,
  candidates: NudgeCandidate[],
  thresholds: NudgePersistenceThresholds,
  now: () => Date = () => new Date()
): number {
  let created = 0;
  for (const candidate of candidates) {
    if (isInCooldown(db, candidate, thresholds, now)) continue;
    // Single `now()` per inserted row — generateNudgeId and createdAt must
    // agree (a stray minute-boundary cross between the two would put a row
    // with id `…_HHmm_…` next to a createdAt one minute ahead).
    const timestamp = now();
    db.insert(nudgeLog)
      .values({
        id: generateNudgeId(candidate.type, timestamp),
        type: candidate.type,
        title: candidate.title,
        body: candidate.body,
        engramIds: JSON.stringify(candidate.engramIds),
        priority: candidate.priority,
        status: 'pending',
        createdAt: timestamp.toISOString(),
        expiresAt: candidate.expiresAt,
        actionType: candidate.action?.type ?? null,
        actionLabel: candidate.action?.label ?? null,
        actionParams: candidate.action ? JSON.stringify(candidate.action.params) : null,
      })
      .run();
    created++;
  }
  return created;
}

function isInCooldown(
  db: CerebrumDb,
  candidate: NudgeCandidate,
  thresholds: NudgePersistenceThresholds,
  now: () => Date
): boolean {
  const cooldownMs = thresholds.nudgeCooldownHours * 60 * 60 * 1000;
  const cutoff = new Date(now().getTime() - cooldownMs).toISOString();
  const sortedIds = JSON.stringify([...candidate.engramIds].toSorted());

  const recent = db
    .select({ engramIds: nudgeLog.engramIds })
    .from(nudgeLog)
    .where(and(eq(nudgeLog.type, candidate.type), sql`${nudgeLog.createdAt} >= ${cutoff}`))
    .all();

  return recent.some((row) => {
    const existing = JSON.stringify((JSON.parse(row.engramIds) as string[]).toSorted());
    return existing === sortedIds;
  });
}

/**
 * Paginated list of contradiction-pattern nudges.
 *
 * Filters at the SQL layer with a `json_extract` predicate on
 * `action_params` so non-contradiction pattern nudges (recurring,
 * emerging) cannot consume page slots or inflate `total`. Pagination
 * applies after the filter, which is what makes it honest.
 */
export function listContradictions(
  db: CerebrumDb,
  opts: { status?: NudgeStatus | null; limit?: number; offset?: number } = {}
): { nudges: Nudge[]; total: number } {
  const conditions = [eq(nudgeLog.type, 'pattern')];
  if (opts.status !== null && opts.status !== undefined) {
    conditions.push(eq(nudgeLog.status, opts.status));
  }
  // Require every contradiction-shape field on action_params at the SQL layer:
  // both the returned rows AND the `total` count reflect only contradiction
  // nudges. A row-level post-filter would let recurring/emerging pattern
  // rows consume page slots and inflate `total`, making pagination dishonest.
  conditions.push(
    sql`json_extract(${nudgeLog.actionParams}, '$.contradiction.engramA') IS NOT NULL`,
    sql`json_extract(${nudgeLog.actionParams}, '$.contradiction.engramB') IS NOT NULL`,
    sql`json_extract(${nudgeLog.actionParams}, '$.contradiction.excerptA') IS NOT NULL`,
    sql`json_extract(${nudgeLog.actionParams}, '$.contradiction.excerptB') IS NOT NULL`,
    sql`json_extract(${nudgeLog.actionParams}, '$.contradiction.conflict') IS NOT NULL`
  );

  const where = and(...conditions);
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const rows = db
    .select()
    .from(nudgeLog)
    .where(where)
    .orderBy(sql`${nudgeLog.createdAt} desc`)
    .limit(limit)
    .offset(offset)
    .all();

  const [totalRow] = db.select({ total: count() }).from(nudgeLog).where(where).all();

  return {
    nudges: rows.map((r) => rowToNudge(r)),
    total: totalRow?.total ?? 0,
  };
}

/**
 * Expire the oldest pending nudges so the pending set stays under the
 * cap. Returns the number of rows that were transitioned to `expired`.
 *
 * The caller decides whether to log the count — this package intentionally
 * carries no logger dependency.
 */
export function enforcePendingCap(db: CerebrumDb, maxPending: number): number {
  const [countRow] = db
    .select({ total: count() })
    .from(nudgeLog)
    .where(eq(nudgeLog.status, 'pending'))
    .all();

  const pendingCount = countRow?.total ?? 0;
  if (pendingCount <= maxPending) return 0;

  const excess = pendingCount - maxPending;
  const oldest = db
    .select({ id: nudgeLog.id })
    .from(nudgeLog)
    .where(eq(nudgeLog.status, 'pending'))
    .orderBy(nudgeLog.createdAt)
    .limit(excess)
    .all();

  if (oldest.length === 0) return 0;

  db.update(nudgeLog)
    .set({ status: 'expired' })
    .where(
      inArray(
        nudgeLog.id,
        oldest.map((r) => r.id)
      )
    )
    .run();
  return oldest.length;
}
