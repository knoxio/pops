/**
 * Tests for the AI alert evaluator + dispatchers (PRD-092 US-07).
 *
 * Covers:
 *  - budget-threshold fires when monthly spend crosses N% of a cost limit
 *  - error-spike fires when error rate exceeds the configured percentage
 *  - latency-degradation fans out per-model when no model scope is set
 *  - deduplication suppresses a second alert within the dedup window
 *  - listing + acknowledgement update the row as expected
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getDrizzle } from '../../../db.js';
import { seedAiUsage, setupTestContext } from '../../../shared/test-utils.js';
import { insertAlertIfNotDuplicate } from './alerts-store.js';
import { dispatchAlert, resolveChannels } from './dispatch.js';
import {
  escapeTelegramMarkdownV2,
  fetchTransport,
  renderTelegramMessage,
  TELEGRAM_REQUEST_TIMEOUT_MS,
} from './dispatchers/telegram.js';
import { acknowledgeAlert, listAlerts, runEvaluation } from './evaluator.js';
import * as service from './service.js';

import type { Database } from 'better-sqlite3';

import type { FiredAlert } from './types.js';

const ctx = setupTestContext();
let db: Database;

beforeEach(() => {
  ({ db } = ctx.setup());
});

afterEach(() => {
  ctx.teardown();
});

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
    expect(service.seedDefaultRules()).toBe(3);
    expect(service.listRules()).toHaveLength(3);
    expect(service.seedDefaultRules()).toBe(0);
    expect(service.listRules()).toHaveLength(3);
  });

  it('backfills missing default rule types even when others already exist', () => {
    // User has manually created a single error-spike rule. Seeding must
    // still create the two missing defaults instead of bailing out wholesale.
    service.createRule({ type: 'error-spike', thresholdValue: 5, windowMinutes: 30 });
    expect(service.seedDefaultRules()).toBe(2);
    const types = service
      .listRules()
      .map((r) => r.type)
      .toSorted();
    expect(types).toEqual(['budget-threshold', 'error-spike', 'latency-degradation']);
    // Re-seeding is still a no-op once all default types exist.
    expect(service.seedDefaultRules()).toBe(0);
  });
});

describe('budget-threshold evaluation', () => {
  it('fires when monthly spend exceeds the threshold percentage of a cost limit', async () => {
    // Budget: $10 monthly cost limit. Threshold rule: 80%.
    db.prepare(
      `INSERT INTO ai_budgets (id, scope_type, scope_value, monthly_token_limit, monthly_cost_limit, action, created_at, updated_at)
       VALUES ('global', 'global', NULL, NULL, 10, 'warn', datetime('now'), datetime('now'))`
    ).run();
    service.createRule({ type: 'budget-threshold', thresholdValue: 80 });

    // Seed $8.10 of usage this month (81% of $10).
    seedAiUsage(db, { cost_usd: 8.1, created_at: thisMonthIso(1) });

    const result = await runEvaluation({ dispatch: false });
    expect(result.alerts).toHaveLength(1);
    const [alert] = result.alerts;
    expect(alert).toBeDefined();
    expect(alert?.type).toBe('budget-threshold');
    expect(alert?.scopeDetail).toBe('budget:global');
    expect(alert?.metricValue).toBeCloseTo(81);
    expect(alert?.thresholdValue).toBe(80);
    expect(alert?.severity).toBe('warning');
    expect(alert?.message).toMatch(/81/);
  });

  it('marks critical severity at 95% or above', async () => {
    db.prepare(
      `INSERT INTO ai_budgets (id, scope_type, scope_value, monthly_token_limit, monthly_cost_limit, action, created_at, updated_at)
       VALUES ('global', 'global', NULL, NULL, 10, 'warn', datetime('now'), datetime('now'))`
    ).run();
    service.createRule({ type: 'budget-threshold', thresholdValue: 80 });
    seedAiUsage(db, { cost_usd: 9.7, created_at: thisMonthIso(1) });

    const result = await runEvaluation({ dispatch: false });
    expect(result.alerts[0]?.severity).toBe('critical');
  });

  it('does not fire when usage is below the threshold', async () => {
    db.prepare(
      `INSERT INTO ai_budgets (id, scope_type, scope_value, monthly_token_limit, monthly_cost_limit, action, created_at, updated_at)
       VALUES ('global', 'global', NULL, NULL, 10, 'warn', datetime('now'), datetime('now'))`
    ).run();
    service.createRule({ type: 'budget-threshold', thresholdValue: 80 });
    seedAiUsage(db, { cost_usd: 2, created_at: thisMonthIso(1) });

    const result = await runEvaluation({ dispatch: false });
    expect(result.alerts).toHaveLength(0);
  });

  it('fires on a token-limit breach even when cost spend is comfortably under its limit', async () => {
    // Budget has both limits configured. Token usage is at 90% (breach),
    // cost usage at 1% (safe). Old short-circuit logic would have returned
    // the cost metric only and missed the breach.
    db.prepare(
      `INSERT INTO ai_budgets (id, scope_type, scope_value, monthly_token_limit, monthly_cost_limit, action, created_at, updated_at)
       VALUES ('global', 'global', NULL, 10000, 100, 'warn', datetime('now'), datetime('now'))`
    ).run();
    service.createRule({ type: 'budget-threshold', thresholdValue: 80 });
    // 9000 tokens (90% of 10k token limit), $1 cost (1% of $100 cost limit).
    seedAiUsage(db, {
      input_tokens: 4500,
      output_tokens: 4500,
      cost_usd: 1,
      created_at: thisMonthIso(1),
    });

    const result = await runEvaluation({ dispatch: false });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.metricValue).toBeGreaterThanOrEqual(80);
    expect(result.alerts[0]?.message).toMatch(/token/);
  });
});

describe('error-spike evaluation', () => {
  it('fires when error rate exceeds the configured percentage', async () => {
    service.createRule({ type: 'error-spike', thresholdValue: 10, windowMinutes: 60 });
    // 10 successes, 2 errors = 16.7% error rate.
    for (let i = 0; i < 10; i++) {
      seedAiUsage(db, { status: 'success', created_at: nowIsoOffset(5 + i) });
    }
    seedAiUsage(db, { status: 'error', created_at: nowIsoOffset(2) });
    seedAiUsage(db, { status: 'timeout', created_at: nowIsoOffset(3) });

    const result = await runEvaluation({ dispatch: false });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.type).toBe('error-spike');
    expect(result.alerts[0]?.metricValue).toBeGreaterThan(10);
  });

  it('does not fire when the error rate is below threshold', async () => {
    service.createRule({ type: 'error-spike', thresholdValue: 10, windowMinutes: 60 });
    for (let i = 0; i < 20; i++) {
      seedAiUsage(db, { status: 'success', created_at: nowIsoOffset(5 + i) });
    }
    seedAiUsage(db, { status: 'error', created_at: nowIsoOffset(2) });

    const result = await runEvaluation({ dispatch: false });
    expect(result.alerts).toHaveLength(0);
  });

  it('ignores rows outside the rolling window', async () => {
    service.createRule({ type: 'error-spike', thresholdValue: 10, windowMinutes: 60 });
    // Outside window — should be ignored.
    for (let i = 0; i < 5; i++) {
      seedAiUsage(db, { status: 'error', created_at: nowIsoOffset(120 + i) });
    }
    // Inside window — 100% success.
    for (let i = 0; i < 5; i++) {
      seedAiUsage(db, { status: 'success', created_at: nowIsoOffset(5 + i) });
    }

    const result = await runEvaluation({ dispatch: false });
    expect(result.alerts).toHaveLength(0);
  });
});

describe('latency-degradation evaluation', () => {
  it('fans out per-model when no scopeModel is configured', async () => {
    service.createRule({
      type: 'latency-degradation',
      thresholdValue: 1000,
      windowMinutes: 60,
    });
    // Model A: P95 ~ 5000ms (breaches).
    for (let i = 0; i < 20; i++) {
      seedAiUsage(db, {
        model: 'fast-1',
        latency_ms: 5000 + i,
        created_at: nowIsoOffset(5 + i),
      });
    }
    // Model B: P95 ~ 100ms (safe).
    for (let i = 0; i < 20; i++) {
      seedAiUsage(db, {
        model: 'slow-0',
        latency_ms: 100 + i,
        created_at: nowIsoOffset(5 + i),
      });
    }

    const result = await runEvaluation({ dispatch: false });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.scopeDetail).toBe('model:fast-1');
  });

  it('respects scopeModel filter', async () => {
    service.createRule({
      type: 'latency-degradation',
      thresholdValue: 1000,
      scopeModel: 'target-model',
      windowMinutes: 60,
    });
    for (let i = 0; i < 20; i++) {
      seedAiUsage(db, {
        model: 'target-model',
        latency_ms: 4000 + i,
        created_at: nowIsoOffset(5 + i),
      });
    }
    for (let i = 0; i < 20; i++) {
      seedAiUsage(db, {
        model: 'other-model',
        latency_ms: 9999,
        created_at: nowIsoOffset(5 + i),
      });
    }

    const result = await runEvaluation({ dispatch: false });
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.scopeDetail).toBe('model:target-model');
  });
});

describe('deduplication', () => {
  it('suppresses a duplicate alert within the dedup window', async () => {
    db.prepare(
      `INSERT INTO ai_budgets (id, scope_type, scope_value, monthly_token_limit, monthly_cost_limit, action, created_at, updated_at)
       VALUES ('global', 'global', NULL, NULL, 10, 'warn', datetime('now'), datetime('now'))`
    ).run();
    service.createRule({ type: 'budget-threshold', thresholdValue: 80 });
    seedAiUsage(db, { cost_usd: 9, created_at: thisMonthIso(1) });

    const first = await runEvaluation({ dispatch: false });
    const second = await runEvaluation({ dispatch: false });

    expect(first.alerts).toHaveLength(1);
    expect(second.alerts).toHaveLength(0);
    expect(second.deduped).toBe(1);
    const { alerts, total } = listAlerts();
    expect(total).toBe(1);
    expect(alerts).toHaveLength(1);
  });
});

describe('listing + acknowledgement', () => {
  it('acknowledges an alert and updates the row', async () => {
    db.prepare(
      `INSERT INTO ai_budgets (id, scope_type, scope_value, monthly_token_limit, monthly_cost_limit, action, created_at, updated_at)
       VALUES ('global', 'global', NULL, NULL, 10, 'warn', datetime('now'), datetime('now'))`
    ).run();
    service.createRule({ type: 'budget-threshold', thresholdValue: 80 });
    seedAiUsage(db, { cost_usd: 9, created_at: thisMonthIso(1) });

    const { alerts } = await runEvaluation({ dispatch: false });
    const alertId = alerts[0]?.id;
    expect(alertId).toBeTypeOf('number');
    if (typeof alertId !== 'number') throw new Error('expected alert id');
    const acked = acknowledgeAlert(alertId);
    expect(acked?.acknowledged).toBe(true);
    expect(acked?.acknowledgedAt).toBeTruthy();

    const { alerts: filtered } = listAlerts({ acknowledged: true });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe(alertId);
    const { alerts: pending } = listAlerts({ acknowledged: false });
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
    const warning = buildAlert({ severity: 'warning' });
    const critical = buildAlert({ severity: 'critical' });
    expect(resolveChannels(warning, {})).toEqual(['nudge']);
    expect(resolveChannels(critical, {})).toEqual(['nudge', 'telegram']);
  });

  it('opt-in env override sends warnings to telegram too', () => {
    const warning = buildAlert({ severity: 'warning' });
    expect(resolveChannels(warning, { POPS_ALERTS_TELEGRAM_INCLUDE_WARNINGS: '1' })).toEqual([
      'nudge',
      'telegram',
    ]);
  });

  it('invokes dispatchers and records per-channel results', async () => {
    const nudge = vi.fn().mockResolvedValue(true);
    const telegram = vi.fn().mockResolvedValue(true);
    const alert = buildAlert({ severity: 'critical' });
    const results = await dispatchAlert(alert, {
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
    const alert = buildAlert({ severity: 'critical' });
    const results = await dispatchAlert(alert, {
      nudgeDispatcher: nudge,
      telegramDispatcher: telegram,
    });
    expect(results[0]).toMatchObject({ channel: 'nudge', delivered: false, error: 'boom' });
    expect(results[1]).toMatchObject({ channel: 'telegram', delivered: true });
  });

  it('renders a markdown telegram message', () => {
    const alert = buildAlert({ severity: 'critical' });
    const text = renderTelegramMessage(alert);
    expect(text).toMatch(/AI Alert/);
    expect(text).toContain('budget:global');
    expect(text).toContain('Budget breach');
  });

  it('escapes MarkdownV2 reserved characters in dynamic alert fields', () => {
    // Dynamic content can contain `_`, `*`, `[`, `]`, `.`, `(`, `)` — Telegram
    // would otherwise reject the message or mis-render it. We must always
    // emit each reserved character backslash-escaped.
    const alert = buildAlert({
      type: 'budget-threshold',
      scopeDetail: 'budget:dev_team.us-east [primary]',
      message: 'Spend at 95% of $100.00 limit (alert!).',
    });
    const text = renderTelegramMessage(alert);
    expect(text).toContain('budget:dev\\_team\\.us\\-east \\[primary\\]');
    expect(text).toContain('Spend at 95% of $100\\.00 limit \\(alert\\!\\)\\.');
    // No raw reserved char immediately following dynamic content.
    expect(text).not.toMatch(/budget:dev_team/);
  });

  it('escape helper covers every MarkdownV2 reserved character', () => {
    const reserved = '_*[]()~`>#+-=|{}.!\\';
    const escaped = escapeTelegramMarkdownV2(reserved);
    // Each reserved character must be prefixed with a backslash.
    for (const ch of reserved) {
      expect(escaped).toContain(`\\${ch}`);
    }
  });

  it('telegram fetch transport aborts when the request hangs', async () => {
    // Stub global fetch with a never-resolving promise; the abort signal must
    // fire from our timeout and surface a clear timeout error.
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
      // Push past the configured timeout so AbortController fires.
      vi.advanceTimersByTime(TELEGRAM_REQUEST_TIMEOUT_MS + 1);
      await expect(promise).rejects.toThrow(/timed out/);
      expect(capturedSignals[0]?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
      globalThis.fetch = originalFetch;
    }
  });
});

describe('latency percentile', () => {
  it('returns the correct P95 element using nearest-rank (not the max)', async () => {
    // Sorted latencies 1..100. Old (floor) formula picked index 95 → 96ms.
    // Nearest-rank P95 is ceil(0.95*100) - 1 = 94 → 95ms. We use a threshold
    // that sits between those values so the bug would surface as a false
    // positive (alert fires when it should not).
    service.createRule({
      type: 'latency-degradation',
      thresholdValue: 95.5,
      scopeModel: 'pct-model',
      windowMinutes: 60,
    });
    for (let i = 1; i <= 100; i++) {
      seedAiUsage(db, {
        model: 'pct-model',
        latency_ms: i,
        created_at: nowIsoOffset(5 + (i % 30)),
      });
    }
    const result = await runEvaluation({ dispatch: false });
    // P95 = 95 < 95.5 → no alert. Old formula would have made P95 = 96.
    expect(result.alerts).toHaveLength(0);
  });
});

describe('updateRule patch semantics', () => {
  it('only touches fields present in the input', () => {
    const created = service.createRule({
      type: 'latency-degradation',
      thresholdValue: 1000,
      scopeProvider: 'claude',
      scopeModel: 'haiku',
      windowMinutes: 30,
    });

    // Concurrent edit B: another caller toggles `enabled` to false via a
    // separate code path. The next updateRule call from caller A must NOT
    // resurrect the old enabled=true value just because it cached `existing`.
    service.setRuleEnabled(created.id, false);
    const updated = service.updateRule({ id: created.id, thresholdValue: 2000 });
    expect(updated.thresholdValue).toBe(2000);
    // The previously-disabled flag must remain false because the patch never
    // included `enabled`.
    expect(updated.enabled).toBe(false);
    expect(updated.scopeProvider).toBe('claude');
    expect(updated.scopeModel).toBe('haiku');
    expect(updated.windowMinutes).toBe(30);
  });

  it('allows clearing optional scope fields with explicit null', () => {
    const created = service.createRule({
      type: 'latency-degradation',
      thresholdValue: 1000,
      scopeProvider: 'claude',
      scopeModel: 'haiku',
    });
    const updated = service.updateRule({
      id: created.id,
      scopeProvider: null,
      scopeModel: null,
    });
    expect(updated.scopeProvider).toBeNull();
    expect(updated.scopeModel).toBeNull();
  });

  it('throws when the rule does not exist (single-statement update path)', () => {
    expect(() => service.updateRule({ id: 9999, thresholdValue: 1 })).toThrow(/not found/);
  });
});

describe('atomic dedup', () => {
  it('insertAlertIfNotDuplicate returns null inside the dedup window', () => {
    service.createRule({ type: 'budget-threshold', thresholdValue: 80 });
    const drizzleDb = getDrizzle();
    const now = new Date();
    const candidate = {
      ruleId: 1,
      type: 'budget-threshold' as const,
      severity: 'warning' as const,
      message: 'breach',
      scopeDetail: 'budget:global',
      metricValue: 90,
      thresholdValue: 80,
    };
    const first = insertAlertIfNotDuplicate(drizzleDb, candidate, now);
    const second = insertAlertIfNotDuplicate(drizzleDb, candidate, now);
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    const { total } = listAlerts();
    expect(total).toBe(1);
  });
});
