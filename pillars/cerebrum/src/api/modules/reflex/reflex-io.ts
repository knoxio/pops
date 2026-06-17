/**
 * Reflex I/O helpers (PRD-089).
 *
 * Extracted from ReflexService to keep file sizes within the max-lines lint
 * limit. Contains disk I/O (load, watch, TOML toggle) and execution logging.
 *
 * Unlike the monolith original this module takes the cerebrum drizzle handle
 * explicitly (`CerebrumDb`) rather than reaching for a process-wide singleton —
 * the pillar owns its own `cerebrum.db` connection.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { watch as chokidarWatch, type FSWatcher } from 'chokidar';
import { eq } from 'drizzle-orm';

import { reflexExecutions } from '../../../db/index.js';
import { updateEnabledInToml } from './reflex-helpers.js';
import { parseReflexesToml } from './reflex-parser.js';

import type { CerebrumDb } from '../../../db/index.js';
import type { ParseError } from './reflex-parser.js';
import type { ThresholdState } from './triggers/threshold-trigger.js';
import type { ActionType, ExecutionStatus, ReflexDefinition, TriggerType } from './types.js';

/** Mutable state bag owned by ReflexService, shared with I/O helpers. */
export interface ReflexState {
  reflexes: ReflexDefinition[];
  parseErrors: ParseError[];
  thresholdStates: Map<string, ThresholdState>;
}

/**
 * Read and parse `reflexes.toml`, updating `state` in-place.
 *
 * A missing file is tolerated (empty reflex set) so the pillar boots and the
 * test suite runs with no TOML present.
 */
export function loadFromDisk(configPath: string, state: ReflexState): void {
  if (!existsSync(configPath)) {
    state.reflexes = [];
    state.parseErrors = [];
    return;
  }

  let text: string;
  try {
    text = readFileSync(configPath, 'utf8');
  } catch (err) {
    console.error(`[reflex] Failed to read: ${(err as Error).message}`);
    state.reflexes = [];
    state.parseErrors = [{ reflexName: null, message: (err as Error).message }];
    return;
  }

  const result = parseReflexesToml(text);
  state.reflexes = result.reflexes;
  state.parseErrors = result.errors;

  for (const e of result.errors) {
    console.warn(`[reflex] ${e.reflexName ? `"${e.reflexName}": ` : ''}${e.message}`);
  }

  for (const key of state.thresholdStates.keys()) {
    if (!state.reflexes.some((r) => r.name === key)) state.thresholdStates.delete(key);
  }
}

/**
 * Start a chokidar file watcher on `configPath`.
 *
 * Returns the new {@link FSWatcher} or `null` if setup fails. When the file
 * changes, `onReload` is invoked so the caller can refresh state.
 */
export function startWatcher(configPath: string, onReload: () => void): FSWatcher | null {
  try {
    const watcher = chokidarWatch(configPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
    });
    watcher.on('change', () => {
      console.warn('[reflex] reflexes.toml changed — reloading');
      onReload();
    });
    watcher.on('error', (err: unknown) => {
      console.error(`[reflex] Watcher error: ${(err as Error).message}`);
    });
    return watcher;
  } catch (err) {
    console.error(`[reflex] Watcher start failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Toggle the `enabled` flag for a named reflex in the TOML config on disk.
 *
 * Rewrites the TOML file then reloads state. Returns `true` on success.
 */
export function setReflexEnabled(
  configPath: string,
  state: ReflexState,
  name: string,
  enabled: boolean
): boolean {
  if (!state.reflexes.find((r) => r.name === name)) return false;
  try {
    const updated = updateEnabledInToml(readFileSync(configPath, 'utf8'), name, enabled);
    if (!updated) return false;
    writeFileSync(configPath, updated, 'utf8');
    loadFromDisk(configPath, state);
    return true;
  } catch (err) {
    console.error(`[reflex] TOML update failed: ${(err as Error).message}`);
    return false;
  }
}

/** Insert a reflex execution record and return its ID. */
export function logExecution(
  db: CerebrumDb,
  entry: {
    reflexName: string;
    triggerType: TriggerType;
    triggerData: Record<string, unknown> | null;
    actionType: ActionType;
    actionVerb: string;
    status: ExecutionStatus;
    result: Record<string, unknown> | null;
  }
): string {
  const now = new Date().toISOString();
  const id = `rex_${entry.reflexName}_${Date.now()}`;
  db.insert(reflexExecutions)
    .values({
      id,
      reflexName: entry.reflexName,
      triggerType: entry.triggerType,
      triggerData: entry.triggerData ? JSON.stringify(entry.triggerData) : null,
      actionType: entry.actionType,
      actionVerb: entry.actionVerb,
      status: entry.status,
      result: entry.result ? JSON.stringify(entry.result) : null,
      triggeredAt: now,
      completedAt: entry.status === 'completed' || entry.status === 'failed' ? now : null,
    })
    .run();
  return id;
}

/**
 * Mark an execution as completed/failed in the DB.
 *
 * Returns the reflex name associated with the execution so the caller can
 * update its running-set, or `null` if the row was not found.
 */
export function completeExecution(
  db: CerebrumDb,
  executionId: string,
  status: ExecutionStatus,
  result: Record<string, unknown> | null
): string | null {
  db.update(reflexExecutions)
    .set({
      status,
      result: result ? JSON.stringify(result) : null,
      completedAt: new Date().toISOString(),
    })
    .where(eq(reflexExecutions.id, executionId))
    .run();
  const row = db
    .select({ reflexName: reflexExecutions.reflexName })
    .from(reflexExecutions)
    .where(eq(reflexExecutions.id, executionId))
    .get();
  return row?.reflexName ?? null;
}
