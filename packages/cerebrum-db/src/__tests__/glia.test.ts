/**
 * Invariant tests for the glia data-access service against an in-memory
 * SQLite seeded with the package-local glia baseline migration. Covers
 * action CRUD + filters, autonomous-window helpers, revert-window counts,
 * and trust-state seed/read/update including the counter-increment
 * shortcut.
 *
 * The baseline is read from
 * `packages/cerebrum-db/migrations/0051_glia_baseline.sql` so the table
 * shape under test is identical to the one shipped in the journal.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { gliaActions } from '../schema.js';
import {
  countAutonomousExecutionsSince,
  countAutonomousRevertsSince,
  countRevertsInWindow,
  deleteAction,
  getAction,
  getTrustState,
  incrementTrustStateCounter,
  insertAction,
  listActions,
  listAutonomousActionsInWindow,
  listTrustStates,
  seedTrustState,
  updateAction,
  updateTrustState,
} from '../services/glia.js';

import type { InsertActionRow } from '../services/glia-types.js';
import type { CerebrumDb } from '../services/internal.js';

const GLIA_MIGRATION = join(__dirname, '../../migrations/0051_glia_baseline.sql');

function freshDb(): CerebrumDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(GLIA_MIGRATION, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return drizzle(raw);
}

function makeAction(
  overrides: Partial<InsertActionRow> & Pick<InsertActionRow, 'id'>
): InsertActionRow {
  return {
    actionType: 'prune',
    affectedIds: ['eng_a'],
    rationale: 'because reasons',
    payload: null,
    phase: 'propose',
    status: 'pending',
    executedAt: null,
    createdAt: '2026-06-10T10:00:00Z',
    ...overrides,
  };
}

describe('insertAction', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('serialises affectedIds and payload as JSON and round-trips via getAction', () => {
    const created = insertAction(
      db,
      makeAction({
        id: 'glia_prune_001',
        affectedIds: ['eng_a', 'eng_b'],
        payload: { mergePlan: 'a+b' },
      })
    );

    expect(created.affectedIds).toEqual(['eng_a', 'eng_b']);
    expect(created.payload).toEqual({ mergePlan: 'a+b' });

    const fetched = getAction(db, 'glia_prune_001');
    expect(fetched).not.toBeNull();
    expect(fetched?.payload).toEqual({ mergePlan: 'a+b' });
  });

  it('stores null payload as SQL NULL (not the string "null")', () => {
    insertAction(db, makeAction({ id: 'glia_null_payload', payload: null }));
    const row = db.select().from(gliaActions).where(eq(gliaActions.id, 'glia_null_payload')).get();
    expect(row?.payload).toBeNull();
  });

  it('preserves autonomous execution status + executedAt as supplied', () => {
    const created = insertAction(
      db,
      makeAction({
        id: 'glia_auto',
        phase: 'act_report',
        status: 'executed',
        executedAt: '2026-06-10T10:05:00Z',
      })
    );
    expect(created.status).toBe('executed');
    expect(created.executedAt).toBe('2026-06-10T10:05:00Z');
  });
});

describe('getAction', () => {
  it('returns null when the row is missing', () => {
    expect(getAction(freshDb(), 'missing')).toBeNull();
  });
});

describe('listActions', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    insertAction(
      db,
      makeAction({
        id: 'a1',
        actionType: 'prune',
        status: 'pending',
        createdAt: '2026-06-10T10:00:00Z',
      })
    );
    insertAction(
      db,
      makeAction({
        id: 'a2',
        actionType: 'consolidate',
        status: 'approved',
        createdAt: '2026-06-10T11:00:00Z',
      })
    );
    insertAction(
      db,
      makeAction({
        id: 'a3',
        actionType: 'prune',
        status: 'executed',
        createdAt: '2026-06-11T10:00:00Z',
      })
    );
  });

  it('returns all rows in created_at desc order with total', () => {
    const result = listActions(db);
    expect(result.total).toBe(3);
    expect(result.actions.map((a) => a.id)).toEqual(['a3', 'a2', 'a1']);
  });

  it('filters by actionType', () => {
    const result = listActions(db, { actionType: 'prune' });
    expect(result.total).toBe(2);
    expect(result.actions.map((a) => a.id).toSorted()).toEqual(['a1', 'a3']);
  });

  it('filters by status', () => {
    const result = listActions(db, { status: 'approved' });
    expect(result.actions.map((a) => a.id)).toEqual(['a2']);
  });

  it('filters by inclusive dateFrom / dateTo', () => {
    const result = listActions(db, {
      dateFrom: '2026-06-10T11:00:00Z',
      dateTo: '2026-06-10T23:59:59Z',
    });
    expect(result.actions.map((a) => a.id)).toEqual(['a2']);
  });

  it('paginates with limit + offset on top of filters', () => {
    const page = listActions(db, { limit: 1, offset: 1 });
    expect(page.actions.map((a) => a.id)).toEqual(['a2']);
    expect(page.total).toBe(3);
  });
});

describe('updateAction', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    insertAction(db, makeAction({ id: 'a1' }));
  });

  it('patches lifecycle columns and returns the updated row', () => {
    const updated = updateAction(db, 'a1', {
      status: 'approved',
      userDecision: 'approve',
      userNote: 'looks good',
      decidedAt: '2026-06-10T12:00:00Z',
    });
    expect(updated?.status).toBe('approved');
    expect(updated?.userDecision).toBe('approve');
    expect(updated?.userNote).toBe('looks good');
    expect(updated?.decidedAt).toBe('2026-06-10T12:00:00Z');
  });

  it('returns the current row when the patch is empty (no-op)', () => {
    const result = updateAction(db, 'a1', {});
    expect(result?.status).toBe('pending');
  });

  it('returns null when the action does not exist', () => {
    expect(updateAction(db, 'missing', { status: 'approved' })).toBeNull();
  });
});

describe('deleteAction', () => {
  it('returns 0 when the action is missing (idempotent)', () => {
    expect(deleteAction(freshDb(), 'missing')).toBe(0);
  });

  it('removes the row and returns 1', () => {
    const db = freshDb();
    insertAction(db, makeAction({ id: 'a1' }));
    expect(deleteAction(db, 'a1')).toBe(1);
    expect(getAction(db, 'a1')).toBeNull();
  });
});

describe('listAutonomousActionsInWindow', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    // Autonomous (decided_at null, executed) inside the window.
    insertAction(
      db,
      makeAction({
        id: 'auto1',
        status: 'executed',
        executedAt: '2026-06-10T10:00:00Z',
        createdAt: '2026-06-10T10:00:00Z',
      })
    );
    insertAction(
      db,
      makeAction({
        id: 'auto2',
        status: 'executed',
        executedAt: '2026-06-10T11:00:00Z',
        createdAt: '2026-06-10T11:00:00Z',
      })
    );
    // Manually decided — should be excluded.
    insertAction(
      db,
      makeAction({ id: 'manual', status: 'executed', executedAt: '2026-06-10T12:00:00Z' })
    );
    updateAction(db, 'manual', { userDecision: 'approve', decidedAt: '2026-06-10T11:30:00Z' });
    // Outside the window on the upper boundary — endDate is exclusive.
    insertAction(
      db,
      makeAction({ id: 'boundary', status: 'executed', executedAt: '2026-06-11T00:00:00Z' })
    );
  });

  it('returns only autonomous executions within [start, end), ordered by executedAt asc', () => {
    const rows = listAutonomousActionsInWindow(db, '2026-06-10T00:00:00Z', '2026-06-11T00:00:00Z');
    expect(rows.map((r) => r.id)).toEqual(['auto1', 'auto2']);
  });
});

describe('countAutonomousExecutionsSince / countAutonomousRevertsSince', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    insertAction(
      db,
      makeAction({
        id: 'exec1',
        actionType: 'prune',
        status: 'executed',
        executedAt: '2026-06-10T10:00:00Z',
      })
    );
    insertAction(
      db,
      makeAction({
        id: 'exec2',
        actionType: 'prune',
        status: 'executed',
        executedAt: '2026-06-10T11:00:00Z',
      })
    );
    insertAction(
      db,
      makeAction({
        id: 'reverted1',
        actionType: 'prune',
        status: 'reverted',
        executedAt: '2026-06-10T09:00:00Z',
      })
    );
    updateAction(db, 'reverted1', { revertedAt: '2026-06-10T12:00:00Z' });
  });

  it('counts only executed autonomous rows for the type since the cutoff', () => {
    expect(countAutonomousExecutionsSince(db, 'prune', '2026-06-10T00:00:00Z')).toBe(2);
    expect(countAutonomousExecutionsSince(db, 'consolidate', '2026-06-10T00:00:00Z')).toBe(0);
  });

  it('excludes rows with null revertedAt from the revert count', () => {
    insertAction(
      db,
      makeAction({
        id: 'broken',
        actionType: 'prune',
        status: 'reverted',
        executedAt: '2026-06-10T09:30:00Z',
      })
    );
    expect(countAutonomousRevertsSince(db, 'prune', '2026-06-10T00:00:00Z')).toBe(1);
  });
});

describe('countRevertsInWindow', () => {
  it('counts reverts of the given type after windowStart', () => {
    const db = freshDb();
    insertAction(db, makeAction({ id: 'r1', actionType: 'prune', status: 'reverted' }));
    updateAction(db, 'r1', { revertedAt: '2026-06-10T10:00:00Z' });
    insertAction(db, makeAction({ id: 'r2', actionType: 'prune', status: 'reverted' }));
    updateAction(db, 'r2', { revertedAt: '2026-06-09T10:00:00Z' });
    insertAction(db, makeAction({ id: 'r3', actionType: 'consolidate', status: 'reverted' }));
    updateAction(db, 'r3', { revertedAt: '2026-06-10T11:00:00Z' });

    expect(countRevertsInWindow(db, 'prune', '2026-06-10T00:00:00Z')).toBe(1);
    expect(countRevertsInWindow(db, 'consolidate', '2026-06-10T00:00:00Z')).toBe(1);
  });
});

describe('seedTrustState + getTrustState + listTrustStates', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('inserts a new row idempotently and reads it back', () => {
    seedTrustState(db, {
      actionType: 'prune',
      currentPhase: 'propose',
      approvedCount: 0,
      rejectedCount: 0,
      revertedCount: 0,
      updatedAt: '2026-06-10T10:00:00Z',
    });
    seedTrustState(db, {
      actionType: 'prune',
      currentPhase: 'silent',
      approvedCount: 99,
      rejectedCount: 99,
      revertedCount: 99,
      updatedAt: '2026-06-10T11:00:00Z',
    });

    const state = getTrustState(db, 'prune');
    expect(state?.currentPhase).toBe('propose');
    expect(state?.approvedCount).toBe(0);
  });

  it('listTrustStates returns every seeded type', () => {
    seedTrustState(db, {
      actionType: 'prune',
      currentPhase: 'propose',
      approvedCount: 0,
      rejectedCount: 0,
      revertedCount: 0,
      updatedAt: '2026-06-10T10:00:00Z',
    });
    seedTrustState(db, {
      actionType: 'consolidate',
      currentPhase: 'propose',
      approvedCount: 0,
      rejectedCount: 0,
      revertedCount: 0,
      updatedAt: '2026-06-10T10:00:00Z',
    });
    expect(
      listTrustStates(db)
        .map((s) => s.actionType)
        .toSorted()
    ).toEqual(['consolidate', 'prune']);
  });
});

describe('updateTrustState + incrementTrustStateCounter', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
    seedTrustState(db, {
      actionType: 'prune',
      currentPhase: 'propose',
      approvedCount: 0,
      rejectedCount: 0,
      revertedCount: 0,
      updatedAt: '2026-06-10T10:00:00Z',
    });
  });

  it('patches a single field and returns the updated row', () => {
    const updated = updateTrustState(db, 'prune', {
      currentPhase: 'act_report',
      autonomousSince: '2026-06-10T11:00:00Z',
      updatedAt: '2026-06-10T11:00:00Z',
    });
    expect(updated?.currentPhase).toBe('act_report');
    expect(updated?.autonomousSince).toBe('2026-06-10T11:00:00Z');
  });

  it('returns null when the action type was never seeded', () => {
    expect(
      updateTrustState(db, 'link', { currentPhase: 'silent', updatedAt: '2026-06-10T10:00:00Z' })
    ).toBeNull();
  });

  it('incrementTrustStateCounter atomically bumps the named counter', () => {
    incrementTrustStateCounter(db, 'prune', 'approvedCount', '2026-06-10T11:00:00Z');
    incrementTrustStateCounter(db, 'prune', 'approvedCount', '2026-06-10T11:01:00Z');
    incrementTrustStateCounter(db, 'prune', 'revertedCount', '2026-06-10T11:02:00Z');

    const state = getTrustState(db, 'prune');
    expect(state?.approvedCount).toBe(2);
    expect(state?.revertedCount).toBe(1);
    expect(state?.updatedAt).toBe('2026-06-10T11:02:00Z');
  });
});
