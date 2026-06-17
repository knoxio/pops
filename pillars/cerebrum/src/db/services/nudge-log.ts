/**
 * Nudge-log persistence (PRD-084).
 *
 * Audit-trail-style table the cerebrum reflex/nudge subsystem writes to
 * when a detector scan produces candidate nudges. The three functions
 * here cover the persistence-layer surface the pops-api `NudgeService`
 * needs from this package:
 *
 *   - {@link persistCandidates} — insert new nudges with cooldown dedup.
 *   - {@link listContradictions} — paginated read of contradiction-pattern
 *     nudges, with the SQL-side `json_extract` filter that prevents
 *     non-contradiction pattern nudges from consuming page slots or
 *     inflating `total`.
 *   - {@link enforcePendingCap} — quietly expire the oldest pending rows
 *     when the cap is exceeded.
 *
 * Functions take a `CerebrumDb` handle as their first argument; the
 * calling layer (pops-api modules, eventually `cerebrum-api`) resolves
 * the singleton or transaction handle to pass in. Mirrors the
 * `@pops/core-db` / `@pops/inventory-db` db-arg pattern.
 *
 * The cross-table read helper `loadActiveEngrams` (which the detector
 * scans depend on) stays in pops-api for now — it reads
 * `engram_index` / `engram_scopes` / `engram_tags`, all cerebrum-owned
 * tables that will move in the engrams slice's own Phase 1 PR.
 */
import { and, count, eq, inArray, sql } from 'drizzle-orm';

import { nudgeLog } from '../schema.js';
import { generateNudgeId, rowToNudge } from './nudge-log-helpers.js';

import type { CerebrumDb } from './internal.js';
import type {
  Nudge,
  NudgeCandidate,
  NudgePersistenceThresholds,
  NudgeStatus,
} from './nudge-log-types.js';

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
 * Paginated list of contradiction-pattern nudges (PRD-084 US-03).
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
