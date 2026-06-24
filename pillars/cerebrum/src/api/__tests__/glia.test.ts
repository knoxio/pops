/**
 * Integration tests for `cerebrum.glia.*` over REST.
 *
 * Boots the app against a per-test temp `cerebrum.db`. Glia rows are seeded
 * directly through the `gliaService` data-access namespace, then the wire
 * surface is exercised via the supertest client. The digest cases use
 * `deliver: false` plus seeded trust phases to prove the three suppression rules
 * without touching Telegram.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  gliaService,
  openCerebrumDb,
  type ActionType,
  type GliaAction,
  type OpenedCerebrumDb,
  type TrustPhase,
} from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeClient,
  makeEmptyPeerClients,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-glia-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      // Point glia.toml at a non-existent file so the hardcoded ADR-021
      // defaults apply deterministically.
      gliaConfigPath: join(tmpDir, '.config', 'glia.toml'),
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
    })
  );
}

function seedTrustState(
  actionType: ActionType,
  phase: TrustPhase,
  overrides: Partial<{
    approvedCount: number;
    rejectedCount: number;
    revertedCount: number;
    autonomousSince: string | null;
  }> = {}
): void {
  gliaService.seedTrustState(cerebrumDb.db, {
    actionType,
    currentPhase: phase,
    approvedCount: 0,
    rejectedCount: 0,
    revertedCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  gliaService.updateTrustState(cerebrumDb.db, actionType, {
    currentPhase: phase,
    approvedCount: overrides.approvedCount ?? 0,
    rejectedCount: overrides.rejectedCount ?? 0,
    revertedCount: overrides.revertedCount ?? 0,
    autonomousSince: overrides.autonomousSince ?? null,
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
}

function seedPendingAction(id: string, actionType: ActionType = 'link'): GliaAction {
  return gliaService.insertAction(cerebrumDb.db, {
    id,
    actionType,
    affectedIds: ['eng_20260101_0900_a', 'eng_20260101_0900_b'],
    rationale: `proposal ${id}`,
    payload: null,
    phase: 'propose',
    status: 'pending',
    executedAt: null,
    createdAt: '2026-01-05T00:00:00.000Z',
  });
}

/** Seed an autonomous executed action inside the daily digest window. */
function seedAutonomousExecuted(
  id: string,
  actionType: ActionType,
  phase: TrustPhase,
  executedAt: string
): void {
  gliaService.insertAction(cerebrumDb.db, {
    id,
    actionType,
    affectedIds: ['eng_20260601_0900_x'],
    rationale: `autonomous ${id}`,
    payload: null,
    phase,
    status: 'executed',
    executedAt,
    createdAt: executedAt,
  });
}

describe('POST /glia/actions/search', () => {
  it('returns an empty result on a fresh DB', async () => {
    const { actions, total } = await client().glia.list();
    expect(actions).toEqual([]);
    expect(total).toBe(0);
  });

  it('filters by status', async () => {
    seedTrustState('link', 'propose');
    seedPendingAction('glia_link_1');
    seedPendingAction('glia_link_2');

    const pending = await client().glia.list({ status: 'pending' });
    expect(pending.total).toBe(2);

    const executed = await client().glia.list({ status: 'executed' });
    expect(executed.total).toBe(0);
  });
});

describe('GET /glia/actions/:id', () => {
  it('404s on an unknown action', async () => {
    await expect(client().glia.get('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('returns a seeded action', async () => {
    seedTrustState('link', 'propose');
    seedPendingAction('glia_link_get');
    const { action } = await client().glia.get('glia_link_get');
    expect(action.id).toBe('glia_link_get');
    expect(action.status).toBe('pending');
    expect(action.affectedIds).toHaveLength(2);
  });
});

describe('POST /glia/actions/:id/decide', () => {
  it('approves a pending action and increments the trust-state counter atomically', async () => {
    seedTrustState('link', 'propose');
    seedPendingAction('glia_link_decide');

    const { action, transition } = await client().glia.decide('glia_link_decide', 'approve');
    expect(action.status).toBe('approved');
    expect(action.userDecision).toBe('approve');
    expect(transition.transitioned).toBe(false);

    const { state } = await client().glia.trustStateGet('link');
    expect(state.approvedCount).toBe(1);
    expect(state.rejectedCount).toBe(0);
  });

  it('increments the rejected counter on a reject', async () => {
    seedTrustState('prune', 'propose');
    seedPendingAction('glia_prune_decide', 'prune');

    await client().glia.decide('glia_prune_decide', 'reject', 'too aggressive');
    const { state } = await client().glia.trustStateGet('prune');
    expect(state.rejectedCount).toBe(1);
    expect(state.approvedCount).toBe(0);
  });

  it('409s when deciding on an already-decided action', async () => {
    seedTrustState('link', 'propose');
    seedPendingAction('glia_link_twice');
    await client().glia.decide('glia_link_twice', 'approve');
    await expect(client().glia.decide('glia_link_twice', 'approve')).rejects.toMatchObject({
      status: 409,
    });
  });

  it('404s deciding on an unknown action', async () => {
    seedTrustState('link', 'propose');
    await expect(client().glia.decide('ghost', 'approve')).rejects.toMatchObject({ status: 404 });
  });
});

describe('GET /glia/trust-state', () => {
  it('lists every seeded trust state', async () => {
    seedTrustState('prune', 'propose');
    seedTrustState('link', 'act_report', { autonomousSince: '2026-01-01T00:00:00.000Z' });

    const { states } = await client().glia.trustStateList();
    const byType = new Map(states.map((s) => [s.actionType, s]));
    expect(byType.get('prune')?.currentPhase).toBe('propose');
    expect(byType.get('link')?.currentPhase).toBe('act_report');
  });

  it('404s on a trust state that was never seeded', async () => {
    await expect(client().glia.trustStateGet('audit')).rejects.toMatchObject({ status: 404 });
  });
});

describe('POST /glia/digest (deliver:false + suppression rules)', () => {
  it('suppresses delivery when the caller disables it', async () => {
    seedTrustState('link', 'act_report', { autonomousSince: '2026-06-01T00:00:00.000Z' });
    seedAutonomousExecuted('glia_link_auto', 'link', 'act_report', isoYesterday());

    const { report, delivery } = await client().glia.digest({ deliver: false });
    expect(report.totalAutonomousActions).toBe(1);
    expect(delivery.attempted).toBe(false);
    expect(delivery.suppressedReason).toBe('Delivery disabled by caller');
    expect(delivery.channels).toEqual([]);
  });

  it('suppresses delivery when there are zero autonomous actions in the period', async () => {
    seedTrustState('link', 'act_report', { autonomousSince: '2026-06-01T00:00:00.000Z' });
    const { report, delivery } = await client().glia.digest({});
    expect(report.totalAutonomousActions).toBe(0);
    expect(delivery.attempted).toBe(false);
    expect(delivery.suppressedReason).toBe('No autonomous actions in period');
  });

  it('suppresses delivery when every type in the digest is in the silent phase', async () => {
    seedTrustState('prune', 'silent', { autonomousSince: '2026-06-01T00:00:00.000Z' });
    seedAutonomousExecuted('glia_prune_silent', 'prune', 'silent', isoYesterday());

    const { report, delivery } = await client().glia.digest({});
    expect(report.totalAutonomousActions).toBe(1);
    expect(delivery.attempted).toBe(false);
    expect(delivery.suppressedReason).toBe('All action types in digest are in silent phase');
  });
});

/**
 * An ISO timestamp inside the previous-day daily-digest window. The digest
 * range is `[startOfYesterday, startOfToday)`, so mid-yesterday is always in
 * range regardless of when the test runs.
 */
function isoYesterday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}
