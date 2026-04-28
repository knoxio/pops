/**
 * Nudge persistence helpers — extracted from NudgeService to stay under
 * the max-lines lint rule.
 */
import { and, count, eq, inArray, sql } from 'drizzle-orm';

import { engramIndex, engramScopes, engramTags, nudgeLog } from '@pops/db-types';

import { logger } from '../../../lib/logger.js';
import { generateNudgeId } from './nudge-helpers.js';

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { EngramSummary, NudgeCandidate, NudgeThresholds } from './types.js';

/** Group rows by engramId into a multi-value map. */
function buildLookup(rows: { engramId: string; val: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const arr = map.get(r.engramId);
    if (arr) arr.push(r.val);
    else map.set(r.engramId, [r.val]);
  }
  return map;
}

/** Load active engrams from the index for detector input. */
export function loadActiveEngrams(db: BetterSQLite3Database): EngramSummary[] {
  const rows = db
    .select()
    .from(engramIndex)
    .where(sql`${engramIndex.status} NOT IN ('archived', 'consolidated')`)
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const scopeMap = buildLookup(
    db
      .select({ engramId: engramScopes.engramId, val: engramScopes.scope })
      .from(engramScopes)
      .where(inArray(engramScopes.engramId, ids))
      .all()
  );
  const tagMap = buildLookup(
    db
      .select({ engramId: engramTags.engramId, val: engramTags.tag })
      .from(engramTags)
      .where(inArray(engramTags.engramId, ids))
      .all()
  );

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    status: r.status,
    scopes: scopeMap.get(r.id) ?? [],
    tags: tagMap.get(r.id) ?? [],
    createdAt: r.createdAt,
    modifiedAt: r.modifiedAt,
  }));
}

/** Persist nudge candidates, enforcing cooldown dedup. */
export function persistCandidates(
  db: BetterSQLite3Database,
  candidates: NudgeCandidate[],
  thresholds: NudgeThresholds,
  now: () => Date
): number {
  let created = 0;
  for (const candidate of candidates) {
    if (isInCooldown(db, candidate, thresholds, now)) continue;
    db.insert(nudgeLog)
      .values({
        id: generateNudgeId(candidate.type, now()),
        type: candidate.type,
        title: candidate.title,
        body: candidate.body,
        engramIds: JSON.stringify(candidate.engramIds),
        priority: candidate.priority,
        status: 'pending',
        createdAt: now().toISOString(),
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

/** Check cooldown: same type + same engram IDs within the cooldown window. */
function isInCooldown(
  db: BetterSQLite3Database,
  candidate: NudgeCandidate,
  thresholds: NudgeThresholds,
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

/** Enforce the max pending nudges cap by expiring oldest. */
export function enforcePendingCap(db: BetterSQLite3Database, maxPending: number): void {
  const [countRow] = db
    .select({ total: count() })
    .from(nudgeLog)
    .where(eq(nudgeLog.status, 'pending'))
    .all();

  const pendingCount = countRow?.total ?? 0;
  if (pendingCount <= maxPending) return;

  const excess = pendingCount - maxPending;
  const oldest = db
    .select({ id: nudgeLog.id })
    .from(nudgeLog)
    .where(eq(nudgeLog.status, 'pending'))
    .orderBy(nudgeLog.createdAt)
    .limit(excess)
    .all();

  if (oldest.length > 0) {
    db.update(nudgeLog)
      .set({ status: 'expired' })
      .where(
        inArray(
          nudgeLog.id,
          oldest.map((r) => r.id)
        )
      )
      .run();
    logger.info({ expired: oldest.length }, '[NudgeService] Expired oldest pending nudges');
  }
}
