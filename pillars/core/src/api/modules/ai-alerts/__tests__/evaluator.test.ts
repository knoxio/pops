/**
 * Tests for the AI alert evaluator + dispatchers (ported from
 * `apps/pops-api/src/modules/core/ai-alerts/evaluator.test.ts`).
 *
 * Runs against an in-memory `core.db` opened per-test; usage + budget rows
 * are seeded via the relocated services. The nudge dispatcher calls the
 * cerebrum REST SDK — tests stub the injectable nudge sink, so no cerebrum
 * db (in-memory or otherwise) is involved.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  aiUsageService,
  openCoreDb,
  type CoreDb,
  type CreateInferenceLogInput,
  type OpenedCoreDb,
} from '../../../../db/index.js';
import { insertAlertIfNotDuplicate } from '../alerts-store.js';
import { dispatchAlert, resolveChannels } from '../dispatch.js';
import { type CerebrumNudgeCreateBody, type NudgeSink } from '../dispatchers/nudge.js';
import {
  escapeTelegramMarkdownV2,
  fetchTransport,
  renderTelegramMessage,
  TELEGRAM_REQUEST_TIMEOUT_MS,
} from '../dispatchers/telegram.js';
import { acknowledgeAlert, listAlerts, runEvaluation } from '../evaluator.js';
import * as service from '../service.js';

import type { CallResult } from '@pops/pillar-sdk/client';

import type { FiredAlert } from '../types.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let db: CoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-ai-alerts-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  db = coreDb.db;
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function okSink(): NudgeSink & { calls: CerebrumNudgeCreateBody[] } {
  const calls: CerebrumNudgeCreateBody[] = [];
  const sink: NudgeSink = (body) => {
    calls.push(body);
    return Promise.resolve<CallResult<unknown>>({ kind: 'ok', value: { nudge: { id: 'n_1' } } });
  };
  return Object.assign(sink, { calls });
}

function seedUsage(overrides: Partial<CreateInferenceLogInput> = {}): void {
  aiUsageService.createInferenceLog(db, {
    provider: overrides.provider ?? 'claude',
    model: overrides.model ?? 'claude-haiku-4-5-20251001',
    operation: overrides.operation ?? 'entity-match',
    domain: 'domain' in overrides ? overrides.domain : 'finance',
    inputTokens: overrides.inputTokens ?? 100,
    outputTokens: overrides.outputTokens ?? 20,
    costUsd: overrides.costUsd ?? 0.001,
    latencyMs: overrides.latencyMs ?? 0,
    status: overrides.status ?? 'success',
    cached: overrides.cached ?? 0,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  });
}

function seedGlobalCostBudget(limit: number): void {
  aiUsageService.upsertBudget(db, {
    id: 'global',
    scopeType: 'global',
    scopeValue: null,
    monthlyTokenLimit: null,
    monthlyCostLimit: limit,
    action: 'warn',
  });
}

function nowIsoOffset(minutesAgo: number, from: Date = new Date()): string {
  return new Date(from.getTime() - minutesAgo * 60 * 1000).toISOString();
}

function thisMonthIso(dayOffset = 0): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString();
}

describe('seedDefaultRules', () => {
  it('creates three rules on first run and is idempotent thereafter', () => {
    expect(service.seedDefaultRules(db)).toBe(3);
    expect(service.listRules(db)).toHaveLength(3);
    expect(service.seedDefaultRules(db)).toBe(0);
    expect(service.listRules(db)).toHaveLength(3);
  });

  it('backfills missing default rule types even when others already exist', () => {
    service.createRule(db, { type: 'error-spike', thresholdValue: 5, windowMinutes: 30 });
    expect(service.seedDefaultRules(db)).toBe(2);
    const types = service
      .listRules(db)
      .map((r) => r.type)
      .toSorted();
    expect(types).toEqual(['budget-threshold', 'error-spike', 'latency-degradation']);
    expect(service.seedDefaultRules(db)).toBe(0);
  });
});

describe('budget-threshold evaluation', () => {
  it('fires when monthly spend exceeds the threshold percentage of a cost limit', async () => {
    seedGlobalCostBudget(10);
    service.createRule(db, { type: 'budget-threshold', thresholdValue: 80 });
    seedUsage({ costUsd: 8.1, createdAt: thisMonthIso(1) });

    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts).toHaveLength(1);
    const [alert] = result.alerts;
    expect(alert?.type).toBe('budget-threshold');
    expect(alert?.scopeDetail).toBe('budget:global');
    expect(alert?.metricValue).toBeCloseTo(81);
    expect(alert?.severity).toBe('warning');
    expect(alert?.message).toMatch(/81/);
  });

  it('marks critical severity at 95% or above', async () => {
    seedGlobalCostBudget(10);
    service.createRule(db, { type: 'budget-threshold', thresholdValue: 80 });
    seedUsage({ costUsd: 9.7, createdAt: thisMonthIso(1) });

    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts[0]?.severity).toBe('critical');
  });

  it('does not fire when usage is below the threshold', async () => {
    seedGlobalCostBudget(10);
    service.createRule(db, { type: 'budget-threshold', thresholdValue: 80 });
    seedUsage({ costUsd: 2, createdAt: thisMonthIso(1) });

    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts).toHaveLength(0);
  });

  it('fires on a token-limit breach even when cost spend is comfortably under', async () => {
    aiUsageService.upsertBudget(db, {
      id: 'global',
      scopeType: 'global',
      scopeValue: null,
      monthlyTokenLimit: 10000,
      monthlyCostLimit: 100,
      action: 'warn',
    });
    service.createRule(db, { type: 'budget-threshold', thresholdValue: 80 });
    seedUsage({ inputTokens: 4500, outputTokens: 4500, costUsd: 1, createdAt: thisMonthIso(1) });

    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.metricValue).toBeGreaterThanOrEqual(80);
    expect(result.alerts[0]?.message).toMatch(/token/);
  });
});

describe('error-spike evaluation', () => {
  it('fires when error rate exceeds the configured percentage', async () => {
    service.createRule(db, { type: 'error-spike', thresholdValue: 10, windowMinutes: 60 });
    for (let i = 0; i < 10; i++) {
      seedUsage({ status: 'success', createdAt: nowIsoOffset(5 + i) });
    }
    seedUsage({ status: 'error', createdAt: nowIsoOffset(2) });
    seedUsage({ status: 'timeout', createdAt: nowIsoOffset(3) });

    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.type).toBe('error-spike');
    expect(result.alerts[0]?.metricValue).toBeGreaterThan(10);
  });

  it('does not fire when the error rate is below threshold', async () => {
    service.createRule(db, { type: 'error-spike', thresholdValue: 10, windowMinutes: 60 });
    for (let i = 0; i < 20; i++) {
      seedUsage({ status: 'success', createdAt: nowIsoOffset(5 + i) });
    }
    seedUsage({ status: 'error', createdAt: nowIsoOffset(2) });

    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts).toHaveLength(0);
  });

  it('ignores rows outside the rolling window', async () => {
    service.createRule(db, { type: 'error-spike', thresholdValue: 10, windowMinutes: 60 });
    for (let i = 0; i < 5; i++) {
      seedUsage({ status: 'error', createdAt: nowIsoOffset(120 + i) });
    }
    for (let i = 0; i < 5; i++) {
      seedUsage({ status: 'success', createdAt: nowIsoOffset(5 + i) });
    }

    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts).toHaveLength(0);
  });
});

describe('latency-degradation evaluation', () => {
  it('fans out per-model when no scopeModel is configured', async () => {
    service.createRule(db, {
      type: 'latency-degradation',
      thresholdValue: 1000,
      windowMinutes: 60,
    });
    for (let i = 0; i < 20; i++) {
      seedUsage({ model: 'fast-1', latencyMs: 5000 + i, createdAt: nowIsoOffset(5 + i) });
    }
    for (let i = 0; i < 20; i++) {
      seedUsage({ model: 'slow-0', latencyMs: 100 + i, createdAt: nowIsoOffset(5 + i) });
    }

    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.scopeDetail).toBe('model:fast-1');
  });

  it('respects scopeModel filter', async () => {
    service.createRule(db, {
      type: 'latency-degradation',
      thresholdValue: 1000,
      scopeModel: 'target-model',
      windowMinutes: 60,
    });
    for (let i = 0; i < 20; i++) {
      seedUsage({ model: 'target-model', latencyMs: 4000 + i, createdAt: nowIsoOffset(5 + i) });
    }
    for (let i = 0; i < 20; i++) {
      seedUsage({ model: 'other-model', latencyMs: 9999, createdAt: nowIsoOffset(5 + i) });
    }

    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.scopeDetail).toBe('model:target-model');
  });

  it('uses nearest-rank P95 (not the max) so a borderline rule does not false-fire', async () => {
    service.createRule(db, {
      type: 'latency-degradation',
      thresholdValue: 95.5,
      scopeModel: 'pct-model',
      windowMinutes: 60,
    });
    for (let i = 1; i <= 100; i++) {
      seedUsage({ model: 'pct-model', latencyMs: i, createdAt: nowIsoOffset(5 + (i % 30)) });
    }
    const result = await runEvaluation(db, { dispatch: false });
    expect(result.alerts).toHaveLength(0);
  });
});

describe('deduplication', () => {
  it('suppresses a duplicate alert within the dedup window', async () => {
    seedGlobalCostBudget(10);
    service.createRule(db, { type: 'budget-threshold', thresholdValue: 80 });
    seedUsage({ costUsd: 9, createdAt: thisMonthIso(1) });

    const first = await runEvaluation(db, { dispatch: false });
    const second = await runEvaluation(db, { dispatch: false });

    expect(first.alerts).toHaveLength(1);
    expect(second.alerts).toHaveLength(0);
    expect(second.deduped).toBe(1);
    const { alerts, total } = listAlerts(db);
    expect(total).toBe(1);
    expect(alerts).toHaveLength(1);
  });

  it('insertAlertIfNotDuplicate returns null on the second insert in-window', () => {
    const rule = service.createRule(db, { type: 'budget-threshold', thresholdValue: 80 });
    const now = new Date();
    const candidate = {
      ruleId: rule.id,
      type: 'budget-threshold' as const,
      severity: 'warning' as const,
      message: 'breach',
      scopeDetail: 'budget:global',
      metricValue: 90,
      thresholdValue: 80,
    };
    const a = insertAlertIfNotDuplicate(db, candidate, now);
    const b = insertAlertIfNotDuplicate(db, candidate, now);
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(listAlerts(db).total).toBe(1);
  });
});

describe('listing + acknowledgement', () => {
  it('acknowledges an alert and updates the row', async () => {
    seedGlobalCostBudget(10);
    service.createRule(db, { type: 'budget-threshold', thresholdValue: 80 });
    seedUsage({ costUsd: 9, createdAt: thisMonthIso(1) });

    const { alerts } = await runEvaluation(db, { dispatch: false });
    const alertId = alerts[0]?.id;
    if (typeof alertId !== 'number') throw new Error('expected alert id');
    const acked = acknowledgeAlert(db, alertId);
    expect(acked?.acknowledged).toBe(true);
    expect(acked?.acknowledgedAt).toBeTruthy();

    const { alerts: filtered } = listAlerts(db, { acknowledged: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe(alertId);
    const { alerts: pending } = listAlerts(db, { acknowledged: false });
    expect(pending).toHaveLength(0);
  });
});

describe('dispatch facade', () => {
  function buildAlert(over: Partial<FiredAlert> = {}): FiredAlert {
    return {
      id: 1,
      ruleId: 1,
      type: 'budget-threshold',
      message: 'Budget breach',
      severity: 'warning',
      scopeDetail: 'budget:global',
      metricValue: 82,
      thresholdValue: 80,
      acknowledged: false,
      acknowledgedAt: null,
      createdAt: new Date().toISOString(),
      ...over,
    };
  }

  it('routes warnings to nudge only and criticals to nudge + telegram', () => {
    expect(resolveChannels(buildAlert({ severity: 'warning' }), {})).toEqual(['nudge']);
    expect(resolveChannels(buildAlert({ severity: 'critical' }), {})).toEqual([
      'nudge',
      'telegram',
    ]);
  });

  it('opt-in env override sends warnings to telegram too', () => {
    expect(
      resolveChannels(buildAlert({ severity: 'warning' }), {
        POPS_ALERTS_TELEGRAM_INCLUDE_WARNINGS: '1',
      })
    ).toEqual(['nudge', 'telegram']);
  });

  it('invokes dispatchers and records per-channel results', async () => {
    const nudge = vi.fn().mockResolvedValue(true);
    const telegram = vi.fn().mockResolvedValue(true);
    const results = await dispatchAlert(buildAlert({ severity: 'critical' }), {
      nudgeDispatcher: nudge,
      telegramDispatcher: telegram,
    });
    expect(nudge).toHaveBeenCalledTimes(1);
    expect(telegram).toHaveBeenCalledTimes(1);
    expect(results.map((r) => [r.channel, r.delivered])).toEqual([
      ['nudge', true],
      ['telegram', true],
    ]);
  });

  it('continues dispatching when one channel throws', async () => {
    const nudge = vi.fn().mockRejectedValue(new Error('boom'));
    const telegram = vi.fn().mockResolvedValue(true);
    const results = await dispatchAlert(buildAlert({ severity: 'critical' }), {
      nudgeDispatcher: nudge,
      telegramDispatcher: telegram,
    });
    expect(results[0]).toMatchObject({ channel: 'nudge', delivered: false, error: 'boom' });
    expect(results[1]).toMatchObject({ channel: 'telegram', delivered: true });
  });

  it('the default nudge dispatcher creates a cerebrum nudge via the injected sink', async () => {
    const sink = okSink();
    const results = await dispatchAlert(buildAlert({ severity: 'warning' }), { nudgeSink: sink });
    expect(results[0]).toMatchObject({ channel: 'nudge', delivered: true });
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0]).toMatchObject({
      type: 'insight',
      title: 'AI alert: budget-threshold',
      body: 'Budget breach (budget:global)',
      priority: 'medium',
      engramIds: [],
      action: {
        type: 'review',
        params: {
          source: 'ai-alert',
          alertId: 1,
          ruleId: 1,
          alertType: 'budget-threshold',
          severity: 'warning',
        },
      },
    });
  });

  it('maps critical severity to a high-priority nudge', async () => {
    const sink = okSink();
    await dispatchAlert(buildAlert({ severity: 'critical' }), {
      nudgeSink: sink,
      channels: ['nudge'],
    });
    expect(sink.calls[0]?.priority).toBe('high');
  });

  it('swallows an unavailable cerebrum and reports the nudge channel as not delivered', async () => {
    const sink: NudgeSink = () =>
      Promise.resolve<CallResult<unknown>>({ kind: 'unavailable', pillar: 'cerebrum' });
    const results = await dispatchAlert(buildAlert({ severity: 'warning' }), { nudgeSink: sink });
    expect(results[0]).toMatchObject({ channel: 'nudge', delivered: false, error: null });
  });

  it('runEvaluation does not break when the nudge sink reports cerebrum unavailable', async () => {
    seedGlobalCostBudget(10);
    service.createRule(db, { type: 'budget-threshold', thresholdValue: 80 });
    seedUsage({ costUsd: 9, createdAt: thisMonthIso(1) });

    const failingSink: NudgeSink = () =>
      Promise.resolve<CallResult<unknown>>({ kind: 'unavailable', pillar: 'cerebrum' });
    const result = await runEvaluation(db, { nudgeSink: failingSink });

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.channels).not.toContain('nudge');
    expect(listAlerts(db).total).toBe(1);
  });

  it('runEvaluation marks the nudge channel delivered when the sink succeeds', async () => {
    seedGlobalCostBudget(10);
    service.createRule(db, { type: 'budget-threshold', thresholdValue: 80 });
    seedUsage({ costUsd: 9, createdAt: thisMonthIso(1) });

    const sink = okSink();
    const result = await runEvaluation(db, { nudgeSink: sink });

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.channels).toContain('nudge');
    expect(sink.calls).toHaveLength(1);
  });

  it('renders a markdown telegram message', () => {
    const text = renderTelegramMessage(buildAlert({ severity: 'critical' }));
    expect(text).toMatch(/AI Alert/);
    expect(text).toContain('budget:global');
    expect(text).toContain('Budget breach');
  });

  it('escapes MarkdownV2 reserved characters in dynamic alert fields', () => {
    const text = renderTelegramMessage(
      buildAlert({
        type: 'budget-threshold',
        scopeDetail: 'budget:dev_team.us-east [primary]',
        message: 'Spend at 95% of $100.00 limit (alert!).',
      })
    );
    expect(text).toContain('budget:dev\\_team\\.us\\-east \\[primary\\]');
    expect(text).toContain('Spend at 95% of $100\\.00 limit \\(alert\\!\\)\\.');
    expect(text).not.toMatch(/budget:dev_team/);
  });

  it('escape helper covers every MarkdownV2 reserved character', () => {
    const reserved = '_*[]()~`>#+-=|{}.!\\';
    const escaped = escapeTelegramMarkdownV2(reserved);
    for (const ch of reserved) {
      expect(escaped).toContain(`\\${ch}`);
    }
  });

  it('telegram fetch transport aborts when the request hangs', async () => {
    const originalFetch = globalThis.fetch;
    const capturedSignals: AbortSignal[] = [];
    const stub: typeof globalThis.fetch = (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          capturedSignals.push(signal);
          signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    globalThis.fetch = stub;

    vi.useFakeTimers();
    try {
      const promise = fetchTransport.send({ botToken: 't', chatId: 'c' }, 'hi');
      vi.advanceTimersByTime(TELEGRAM_REQUEST_TIMEOUT_MS + 1);
      await expect(promise).rejects.toThrow(/timed out/);
      expect(capturedSignals[0]?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
      globalThis.fetch = originalFetch;
    }
  });
});

describe('updateRule patch semantics', () => {
  it('only touches fields present in the input', () => {
    const created = service.createRule(db, {
      type: 'latency-degradation',
      thresholdValue: 1000,
      scopeProvider: 'claude',
      scopeModel: 'haiku',
      windowMinutes: 30,
    });

    service.setRuleEnabled(db, created.id, false);
    const updated = service.updateRule(db, { id: created.id, thresholdValue: 2000 });
    expect(updated.thresholdValue).toBe(2000);
    expect(updated.enabled).toBe(false);
    expect(updated.scopeProvider).toBe('claude');
    expect(updated.scopeModel).toBe('haiku');
    expect(updated.windowMinutes).toBe(30);
  });

  it('allows clearing optional scope fields with explicit null', () => {
    const created = service.createRule(db, {
      type: 'latency-degradation',
      thresholdValue: 1000,
      scopeProvider: 'claude',
      scopeModel: 'haiku',
    });
    const updated = service.updateRule(db, {
      id: created.id,
      scopeProvider: null,
      scopeModel: null,
    });
    expect(updated.scopeProvider).toBeNull();
    expect(updated.scopeModel).toBeNull();
  });

  it('throws when the rule does not exist', () => {
    expect(() => service.updateRule(db, { id: 9999, thresholdValue: 1 })).toThrow(/not found/);
  });
});
