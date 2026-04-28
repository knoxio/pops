/**
 * Reflex service helpers (PRD-089).
 *
 * Extracted from reflex-service.ts to keep file sizes manageable.
 */
import type {
  ReflexDefinition,
  ReflexExecution,
  TriggerType,
  ActionType,
  ExecutionStatus,
} from './types.js';

/** Convert a DB row into a typed ReflexExecution. */
export function toReflexExecution(row: {
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
}): ReflexExecution {
  return {
    id: row.id,
    reflexName: row.reflexName,
    triggerType: row.triggerType as TriggerType,
    triggerData: row.triggerData ? (JSON.parse(row.triggerData) as Record<string, unknown>) : null,
    actionType: row.actionType as ActionType,
    actionVerb: row.actionVerb,
    status: row.status as ExecutionStatus,
    result: row.result ? (JSON.parse(row.result) as Record<string, unknown>) : null,
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
