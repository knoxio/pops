/**
 * Nudge persistence and data-mapping helpers (PRD-084).
 *
 * Extracted from NudgeService to keep the service file within line limits.
 */
import type { NudgeLogRow as DrizzleNudgeLogRow } from '@pops/db-types';

import type { Nudge, NudgeActionType, NudgePriority, NudgeStatus, NudgeType } from './types.js';

/**
 * Shape of a row read from the `nudge_log` table.
 *
 * Re-exported from the drizzle inference so the JS-side property names
 * (`engramIds`, `createdAt`, ...) match what a `db.select()` actually
 * returns. The schema's SQL-side column names use snake_case but
 * drizzle maps them to camelCase on the JS side.
 */
export type NudgeLogRow = DrizzleNudgeLogRow;

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

/** Generate a nudge ID per PRD-084 spec: `nudge_{YYYYMMDD}_{HHmm}_{type}_{slug}`. */
export function generateNudgeId(type: NudgeType, now: Date): string {
  const pad = (n: number, len: number): string => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
  const time = `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}`;
  const rand = Math.random().toString(36).slice(2, 8);
  return `nudge_${date}_${time}_${type}_${rand}`;
}
