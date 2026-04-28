/**
 * Nudge persistence and data-mapping helpers (PRD-084).
 *
 * Extracted from NudgeService to keep the service file within line limits.
 */
import type { Nudge, NudgeActionType, NudgePriority, NudgeStatus, NudgeType } from './types.js';

/** Shape of a row read from the nudge_log table. */
export interface NudgeLogRow {
  id: string;
  type: string;
  title: string;
  body: string;
  engram_ids: string;
  priority: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  acted_at: string | null;
  action_type: string | null;
  action_label: string | null;
  action_params: string | null;
}

/** Map a nudge_log row to a Nudge domain object. */
export function rowToNudge(row: NudgeLogRow): Nudge {
  return {
    id: row.id,
    type: row.type as NudgeType,
    title: row.title,
    body: row.body,
    engramIds: JSON.parse(row.engram_ids) as string[],
    priority: row.priority as NudgePriority,
    status: row.status as NudgeStatus,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    actedAt: row.acted_at,
    action: row.action_type
      ? {
          type: row.action_type as NudgeActionType,
          label: row.action_label ?? '',
          params: row.action_params
            ? (JSON.parse(row.action_params) as Record<string, unknown>)
            : {},
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
