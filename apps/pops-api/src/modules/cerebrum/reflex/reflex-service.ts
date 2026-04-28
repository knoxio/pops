/**
 * ReflexService — core orchestrator for the reflex system (PRD-089).
 *
 * Loads and watches `reflexes.toml`, maintains a registry, matches
 * events/thresholds/schedules, and logs execution history.
 */
import { join } from 'node:path';

import { eq } from 'drizzle-orm';

import { reflexExecutions } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { toReflexExecution, buildTestTriggerData } from './reflex-helpers.js';
import {
  loadFromDisk,
  startWatcher,
  setReflexEnabled,
  logExecution,
  completeExecution,
} from './reflex-io.js';
import { enrichWithStatus, getReflexHistory, queryExecutionHistory } from './reflex-queries.js';
import { matchesEventTrigger, resolveTemplateVariables } from './triggers/event-trigger.js';
import { evaluateThreshold, createInitialThresholdState } from './triggers/threshold-trigger.js';

import type { FSWatcher } from 'chokidar';

import type { ReflexState } from './reflex-io.js';
import type { ParseError } from './reflex-parser.js';
import type { ThresholdState } from './triggers/threshold-trigger.js';
import type {
  ReflexDefinition,
  ReflexExecution,
  ReflexWithStatus,
  EngramEventPayload,
  TriggerType,
  ExecutionStatus,
} from './types.js';

export class ReflexService {
  private watcher: FSWatcher | null = null;
  private readonly configPath: string;
  private readonly thresholdStates = new Map<string, ThresholdState>();
  private readonly runningReflexes = new Set<string>();
  private readonly state: ReflexState;

  constructor(engramRoot: string) {
    this.configPath = join(engramRoot, '.config', 'reflexes.toml');
    this.state = { reflexes: [], parseErrors: [], thresholdStates: this.thresholdStates };
  }

  start(): void {
    loadFromDisk(this.configPath, this.state);
    if (!this.watcher) {
      this.watcher =
        startWatcher(this.configPath, () => loadFromDisk(this.configPath, this.state)) ?? null;
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
    this.state.reflexes = [];
    this.state.parseErrors = [];
    this.thresholdStates.clear();
    this.runningReflexes.clear();
  }

  getAll(): ReflexDefinition[] {
    return this.state.reflexes;
  }
  getByName(name: string): ReflexDefinition | undefined {
    return this.state.reflexes.find((r) => r.name === name);
  }
  getEnabled(): ReflexDefinition[] {
    return this.state.reflexes.filter((r) => r.enabled);
  }
  getByTriggerType(type: TriggerType): ReflexDefinition[] {
    return this.state.reflexes.filter((r) => r.trigger.type === type);
  }
  getParseErrors(): ParseError[] {
    return this.state.parseErrors;
  }

  processEvent(payload: EngramEventPayload): string[] {
    return this.getEnabled()
      .filter((r) => matchesEventTrigger(r, payload))
      .map((reflex) => {
        const resolvedTarget = reflex.action.target
          ? resolveTemplateVariables(reflex.action.target, payload)
          : undefined;
        return logExecution({
          reflexName: reflex.name,
          triggerType: 'event',
          triggerData: {
            event: payload.event,
            engramId: payload.engramId,
            engramType: payload.engramType,
            scopes: payload.scopes,
            source: payload.source,
            changes: payload.changes,
          },
          actionType: reflex.action.type,
          actionVerb: reflex.action.verb,
          status: 'triggered',
          result: resolvedTarget ? { resolvedTarget } : null,
        });
      });
  }

  evaluateThresholds(metrics: Record<string, number>): string[] {
    const ids: string[] = [];
    for (const reflex of this.getEnabled().filter((r) => r.trigger.type === 'threshold')) {
      if (reflex.trigger.type !== 'threshold') continue;
      const val = metrics[reflex.trigger.metric];
      if (val === undefined) continue;
      const prev = this.thresholdStates.get(reflex.name) ?? createInitialThresholdState();
      const { shouldFire, newState } = evaluateThreshold(reflex, val, prev);
      this.thresholdStates.set(reflex.name, newState);
      if (shouldFire) {
        ids.push(
          logExecution({
            reflexName: reflex.name,
            triggerType: 'threshold',
            triggerData: {
              metric: reflex.trigger.metric,
              value: val,
              threshold: reflex.trigger.value,
            },
            actionType: reflex.action.type,
            actionVerb: reflex.action.verb,
            status: 'triggered',
            result: null,
          })
        );
      }
    }
    return ids;
  }

  fireScheduled(reflexName: string): string | null {
    const reflex = this.getByName(reflexName);
    if (!reflex || !reflex.enabled || reflex.trigger.type !== 'schedule') return null;
    if (this.runningReflexes.has(reflexName)) {
      console.warn(`[reflex] Skipping scheduled "${reflexName}" — previous still running`);
      return null;
    }
    this.runningReflexes.add(reflexName);
    return logExecution({
      reflexName: reflex.name,
      triggerType: 'schedule',
      triggerData: { cron: reflex.trigger.cron, firedAt: new Date().toISOString() },
      actionType: reflex.action.type,
      actionVerb: reflex.action.verb,
      status: 'triggered',
      result: null,
    });
  }

  completeExecution(
    executionId: string,
    status: ExecutionStatus,
    result: Record<string, unknown> | null
  ): void {
    const name = completeExecution(executionId, status, result);
    if (name) this.runningReflexes.delete(name);
  }

  listWithStatus(timezone?: string): ReflexWithStatus[] {
    return this.state.reflexes.map((r) => enrichWithStatus(r, timezone));
  }

  getWithHistory(
    name: string,
    limit = 20
  ): { reflex: ReflexWithStatus; history: ReflexExecution[] } | null {
    const reflex = this.getByName(name);
    return reflex ? getReflexHistory(reflex, limit) : null;
  }

  testReflex(name: string): ReflexExecution | null {
    const reflex = this.getByName(name);
    if (!reflex) return null;
    const id = logExecution({
      reflexName: reflex.name,
      triggerType: reflex.trigger.type,
      triggerData: buildTestTriggerData(reflex),
      actionType: reflex.action.type,
      actionVerb: reflex.action.verb,
      status: 'completed',
      result: { dryRun: true, wouldExecute: `${reflex.action.type}:${reflex.action.verb}` },
    });
    const row = getDrizzle()
      .select()
      .from(reflexExecutions)
      .where(eq(reflexExecutions.id, id))
      .get();
    return row ? toReflexExecution(row) : null;
  }

  enableReflex(name: string): boolean {
    return setReflexEnabled(this.configPath, this.state, name, true);
  }
  disableReflex(name: string): boolean {
    return setReflexEnabled(this.configPath, this.state, name, false);
  }

  getHistory(opts: {
    name?: string;
    triggerType?: TriggerType;
    status?: ExecutionStatus;
    limit?: number;
    offset?: number;
  }): { executions: ReflexExecution[]; total: number } {
    return queryExecutionHistory(opts);
  }
}
