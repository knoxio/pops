/** Reflex service helpers. */
import {
  ACTION_TYPES,
  type ActionType,
  type ExecutionStatus,
  type ReflexDefinition,
  type ReflexExecution,
  type TriggerType,
} from './types.js';

const TRIGGER_TYPES: readonly TriggerType[] = ['event', 'threshold', 'schedule'];
const EXECUTION_STATUSES: readonly ExecutionStatus[] = [
  'triggered',
  'executing',
  'completed',
  'failed',
];

function toTriggerType(value: string): TriggerType {
  const match = TRIGGER_TYPES.find((t) => t === value);
  if (!match) throw new Error(`reflex execution row has unknown trigger_type "${value}"`);
  return match;
}

function toActionType(value: string): ActionType {
  const match = ACTION_TYPES.find((t) => t === value);
  if (!match) throw new Error(`reflex execution row has unknown action_type "${value}"`);
  return match;
}

function toExecutionStatus(value: string): ExecutionStatus {
  const match = EXECUTION_STATUSES.find((s) => s === value);
  if (!match) throw new Error(`reflex execution row has unknown status "${value}"`);
  return match;
}

function parseJsonRecord(value: string | null): Record<string, unknown> | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return { ...parsed };
  }
  return null;
}

/** Shape of a `reflex_executions` row as read from the DB. */
export interface ReflexExecutionRowLike {
  id: string;
  reflexName: string;
  triggerType: string;
  triggerData: string | null;
  actionType: string;
  actionVerb: string;
  status: string;
  result: string | null;
  triggeredAt: string;
  completedAt: string | null;
}

/** Convert a DB row into a typed ReflexExecution. */
export function toReflexExecution(row: ReflexExecutionRowLike): ReflexExecution {
  return {
    id: row.id,
    reflexName: row.reflexName,
    triggerType: toTriggerType(row.triggerType),
    triggerData: parseJsonRecord(row.triggerData),
    actionType: toActionType(row.actionType),
    actionVerb: row.actionVerb,
    status: toExecutionStatus(row.status),
    result: parseJsonRecord(row.result),
    triggeredAt: row.triggeredAt,
    completedAt: row.completedAt,
  };
}

/**
 * Update the `enabled` field for a named reflex in raw TOML text.
 *
 * Uses a targeted line-by-line replacement to preserve comments and formatting.
 * Returns null if the reflex is not found.
 */
export function updateEnabledInToml(
  toml: string,
  reflexName: string,
  enabled: boolean
): string | null {
  const lines = toml.split('\n');
  let inTargetBlock = false;
  let foundName = false;
  let modified = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const trimmed = line.trim();

    if (trimmed === '[[reflex]]') {
      inTargetBlock = false;
      foundName = false;
    }

    if (trimmed === `name = "${reflexName}"` || trimmed === `name = '${reflexName}'`) {
      inTargetBlock = true;
      foundName = true;
    }

    if (inTargetBlock && foundName && /^\s*enabled\s*=\s*(true|false)/.test(trimmed)) {
      const indent = line.match(/^(\s*)/)?.[1] ?? '';
      lines[i] = `${indent}enabled = ${String(enabled)}`;
      modified = true;
      inTargetBlock = false;
    }
  }

  return modified ? lines.join('\n') : null;
}

/** Build synthetic trigger data for a dry-run test execution. */
export function buildTestTriggerData(reflex: ReflexDefinition): Record<string, unknown> {
  switch (reflex.trigger.type) {
    case 'event':
      return {
        event: reflex.trigger.event,
        engramId: 'test-engram-id',
        engramType: reflex.trigger.conditions?.type ?? 'note',
        scopes: reflex.trigger.conditions?.scopes ?? ['test'],
        source: reflex.trigger.conditions?.source ?? 'test',
        dryRun: true,
      };
    case 'threshold':
      return {
        metric: reflex.trigger.metric,
        value: reflex.trigger.value,
        threshold: reflex.trigger.value,
        dryRun: true,
      };
    case 'schedule':
      return {
        cron: reflex.trigger.cron,
        firedAt: new Date().toISOString(),
        dryRun: true,
      };
  }
}
