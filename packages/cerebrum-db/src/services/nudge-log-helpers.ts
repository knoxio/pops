/**
 * Pure helpers for the nudge_log slice (PRD-084).
 *
 * `rowToNudge` is the mapping from a drizzle-inferred row shape to the
 * public `Nudge` domain object; `generateNudgeId` is the ID format
 * PRD-084 specifies (`nudge_{YYYYMMDD}_{HHmm}_{type}_{slug}`).
 */
import type { InferSelectModel } from 'drizzle-orm';

import type { nudgeLog } from '../schema/nudge-log.js';
import type {
  Nudge,
  NudgeActionType,
  NudgePriority,
  NudgeStatus,
  NudgeType,
} from './nudge-log-types.js';

/** Row shape as drizzle returns it from `db.select().from(nudgeLog)`. */
export type NudgeLogRow = InferSelectModel<typeof nudgeLog>;

/** Map a nudge_log row to a Nudge domain object. */
export function rowToNudge(row: NudgeLogRow): Nudge {
  return {
    id: row.id,
    type: row.type as NudgeType,
    title: row.title,
    body: row.body,
    engramIds: JSON.parse(row.engramIds) as string[],
    priority: row.priority as NudgePriority,
    status: row.status as NudgeStatus,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    actedAt: row.actedAt,
    action: row.actionType
      ? {
          type: row.actionType as NudgeActionType,
          label: row.actionLabel ?? '',
          params: row.actionParams ? (JSON.parse(row.actionParams) as Record<string, unknown>) : {},
        }
      : null,
  };
}

/**
 * Generate a nudge ID per PRD-084: `nudge_{YYYYMMDD}_{HHmm}_{type}_{slug}`.
 *
 * The slug suffix is a short base-36 random tail; collisions within the
 * same minute are vanishingly unlikely at single-user scale and the
 * persistence layer dedups by (type, sorted engramIds, cooldown window)
 * separately so id-collision isn't load-bearing for correctness here.
 */
export function generateNudgeId(type: NudgeType, now: Date): string {
  const pad = (n: number, len: number): string => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
  const time = `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `nudge_${date}_${time}_${type}_${rand}`;
}
