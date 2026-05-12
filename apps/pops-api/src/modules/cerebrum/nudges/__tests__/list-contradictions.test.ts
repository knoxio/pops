/**
 * Tests for NudgeService.listContradictions (PRD-084 US-03, #2580 — F6).
 *
 * Asserts the SQL-layer filter: only `type='pattern'` rows whose
 * `action_params` carries a `contradiction` payload are paginated and
 * counted. Recurring/emerging pattern rows MUST NOT consume page slots
 * or inflate `total`.
 *
 * Uses a real in-memory SQLite database so `json_extract` actually
 * executes — the mock-DB pattern used by `nudge-service.test.ts`
 * cannot exercise SQL semantics.
 */
import BetterSqlite3 from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { NudgeService } = await import('../nudge-service.js');

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { NudgeThresholds } from '../types.js';

function defaultThresholds(): NudgeThresholds {
  return {
    consolidationSimilarity: 0.85,
    consolidationMinCluster: 3,
    stalenessDays: 90,
    patternMinOccurrences: 5,
    maxPendingNudges: 20,
    nudgeCooldownHours: 24,
  };
}

function createDb(): { db: BetterSqlite3.Database; drizzleDb: BetterSQLite3Database } {
  const db = new BetterSqlite3(':memory:');
  db.exec(`
    CREATE TABLE nudge_log (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      engram_ids TEXT NOT NULL,
      priority TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      acted_at TEXT,
      action_type TEXT,
      action_label TEXT,
      action_params TEXT
    );
    CREATE INDEX idx_nudge_log_type ON nudge_log(type);
    CREATE INDEX idx_nudge_log_status ON nudge_log(status);
    CREATE INDEX idx_nudge_log_priority ON nudge_log(priority);
    CREATE INDEX idx_nudge_log_created_at ON nudge_log(created_at);
  `);
  return { db, drizzleDb: drizzle(db) };
}

interface SeedRow {
  id: string;
  type: 'pattern' | 'staleness';
  status: 'pending' | 'dismissed' | 'acted' | 'expired';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  actionParams?: Record<string, unknown> | null;
}

function seed(db: BetterSqlite3.Database, rows: SeedRow[]): void {
  const stmt = db.prepare(`
    INSERT INTO nudge_log
      (id, type, title, body, engram_ids, priority, status, created_at,
       action_type, action_label, action_params)
    VALUES
      (@id, @type, @title, @body, @engram_ids, @priority, @status, @createdAt,
       'link', 'Open', @actionParams)
  `);
  for (const row of rows) {
    stmt.run({
      id: row.id,
      type: row.type,
      title: `T-${row.id}`,
      body: `B-${row.id}`,
      engram_ids: JSON.stringify(['eng_a', 'eng_b']),
      priority: row.priority,
      status: row.status,
      createdAt: row.createdAt,
      actionParams: row.actionParams === null ? null : JSON.stringify(row.actionParams ?? {}),
    });
  }
}

function makeService(drizzleDb: BetterSQLite3Database) {
  return new NudgeService({
    db: drizzleDb,
    searchService: {} as never,
    consolidationDetector: {} as never,
    stalenessDetector: {} as never,
    patternDetector: {} as never,
    thresholds: defaultThresholds(),
    now: () => new Date('2026-05-12T10:00:00Z'),
  });
}

describe('NudgeService.listContradictions', () => {
  let db: BetterSqlite3.Database;
  let drizzleDb: BetterSQLite3Database;

  beforeEach(() => {
    ({ db, drizzleDb } = createDb());
  });

  it('returns only contradictions and excludes recurring/emerging pattern rows', () => {
    seed(db, [
      {
        id: 'n_contradict_1',
        type: 'pattern',
        status: 'pending',
        priority: 'high',
        createdAt: '2026-05-10T10:00:00Z',
        actionParams: {
          contradiction: {
            engramA: 'eng_a',
            engramB: 'eng_b',
            excerptA: 'x',
            excerptB: 'y',
            conflict: 'C',
          },
        },
      },
      // Recurring pattern (no contradiction key) — must be filtered out.
      {
        id: 'n_recurring',
        type: 'pattern',
        status: 'pending',
        priority: 'medium',
        createdAt: '2026-05-09T10:00:00Z',
        actionParams: { topic: 'foo', engramIds: ['eng_a'] },
      },
      // Emerging pattern (also no contradiction key).
      {
        id: 'n_emerging',
        type: 'pattern',
        status: 'pending',
        priority: 'medium',
        createdAt: '2026-05-08T10:00:00Z',
        actionParams: { topic: 'bar', engramIds: ['eng_b'] },
      },
      {
        id: 'n_contradict_2',
        type: 'pattern',
        status: 'pending',
        priority: 'high',
        createdAt: '2026-05-07T10:00:00Z',
        actionParams: {
          contradiction: {
            engramA: 'eng_c',
            engramB: 'eng_d',
            excerptA: 'p',
            excerptB: 'q',
            conflict: 'C2',
          },
        },
      },
      // Non-pattern nudge — must be excluded by the type filter.
      {
        id: 'n_staleness',
        type: 'staleness',
        status: 'pending',
        priority: 'low',
        createdAt: '2026-05-06T10:00:00Z',
        actionParams: { engramId: 'eng_e' },
      },
    ]);

    const result = makeService(drizzleDb).listContradictions({ status: 'pending' });

    const ids = result.nudges.map((n) => n.id).toSorted();
    expect(ids).toEqual(['n_contradict_1', 'n_contradict_2']);
    // Total must reflect the FILTERED count, not the count of all
    // pattern rows — otherwise pagination is meaningless.
    expect(result.total).toBe(2);
  });

  it('paginates contradictions correctly when recurring rows interleave', () => {
    // Seed 5 contradictions plus 10 recurring rows; if the filter is
    // applied after pagination, the page slice would contain mostly
    // recurring rows and hide contradictions.
    const rows: SeedRow[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push({
        id: `n_contradict_${i}`,
        type: 'pattern',
        status: 'pending',
        priority: 'high',
        createdAt: `2026-05-${String(20 - i * 2).padStart(2, '0')}T10:00:00Z`,
        actionParams: {
          contradiction: {
            engramA: `eng_a${i}`,
            engramB: `eng_b${i}`,
            excerptA: 'x',
            excerptB: 'y',
            conflict: 'c',
          },
        },
      });
    }
    for (let i = 0; i < 10; i++) {
      rows.push({
        id: `n_recurring_${i}`,
        type: 'pattern',
        status: 'pending',
        priority: 'medium',
        createdAt: `2026-05-${String(19 - i).padStart(2, '0')}T10:00:00Z`,
        actionParams: { topic: 'foo', engramIds: ['eng_x'] },
      });
    }
    seed(db, rows);

    const svc = makeService(drizzleDb);

    const page1 = svc.listContradictions({ status: 'pending', limit: 3, offset: 0 });
    expect(page1.total).toBe(5);
    expect(page1.nudges).toHaveLength(3);
    expect(page1.nudges.every((n) => n.id.startsWith('n_contradict_'))).toBe(true);

    const page2 = svc.listContradictions({ status: 'pending', limit: 3, offset: 3 });
    expect(page2.total).toBe(5);
    expect(page2.nudges).toHaveLength(2);
    expect(page2.nudges.every((n) => n.id.startsWith('n_contradict_'))).toBe(true);
  });

  it('honours status filter and ignores it when null', () => {
    seed(db, [
      {
        id: 'n_pending',
        type: 'pattern',
        status: 'pending',
        priority: 'high',
        createdAt: '2026-05-10T10:00:00Z',
        actionParams: {
          contradiction: {
            engramA: 'a',
            engramB: 'b',
            excerptA: 'x',
            excerptB: 'y',
            conflict: 'c',
          },
        },
      },
      {
        id: 'n_dismissed',
        type: 'pattern',
        status: 'dismissed',
        priority: 'high',
        createdAt: '2026-05-09T10:00:00Z',
        actionParams: {
          contradiction: {
            engramA: 'a',
            engramB: 'b',
            excerptA: 'x',
            excerptB: 'y',
            conflict: 'c',
          },
        },
      },
    ]);

    const svc = makeService(drizzleDb);

    const pending = svc.listContradictions({ status: 'pending' });
    expect(pending.total).toBe(1);
    expect(pending.nudges[0]?.id).toBe('n_pending');

    const all = svc.listContradictions({ status: null });
    expect(all.total).toBe(2);
  });
});
