/**
 * Invariant tests for the nudge_log service against an in-memory SQLite
 * seeded with the canonical `nudge_log` migration. Pure DB + service
 * layer — no tRPC, no Express, no NudgeService wrapper.
 *
 * Higher-level tRPC coverage lives in pops-api's own integration suite
 * (until the cutover PR routes it through this package).
 *
 * The nudge_log CREATE TABLE is read from the package-local migration
 * copy at `packages/cerebrum-db/migrations/0039_dry_fabian_cortez.sql`.
 * The package-local journal now owns both this tag and the safety
 * re-creation `0044_nudge_log.sql` (which carries a defensive CREATE
 * TABLE IF NOT EXISTS + index); both files together describe the
 * authoritative schema since the shared-journal copies were retired in
 * Track L5 of the pillar-migration roadmap. This test only seeds from
 * 0039 because 0044 is idempotent against an already-seeded DB and adds
 * no further schema state.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { nudgeLog } from '../schema.js';
import { generateNudgeId, rowToNudge } from '../services/nudge-log-helpers.js';
import { enforcePendingCap, listContradictions, persistCandidates } from '../services/nudge-log.js';

import type { CerebrumDb } from '../services/internal.js';
import type {
  NudgeAction,
  NudgeCandidate,
  NudgePersistenceThresholds,
} from '../services/nudge-log-types.js';

const NUDGE_LOG_MIGRATION = join(__dirname, '../../../migrations/0039_dry_fabian_cortez.sql');

const CONTRADICTION_PARAMS = {
  contradiction: {
    engramA: 'eA',
    engramB: 'eB',
    excerptA: 'x',
    excerptB: 'y',
    conflict: 'C',
  },
};

function freshDb(): CerebrumDb {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  const sql = readFileSync(NUDGE_LOG_MIGRATION, 'utf8');
  for (const stmt of sql.split('--> statement-breakpoint')) {
    const trimmed = stmt.trim();
    if (trimmed.length > 0) raw.exec(trimmed);
  }
  return drizzle(raw);
}

function defaultThresholds(): NudgePersistenceThresholds {
  return { nudgeCooldownHours: 24 };
}

function candidate(
  overrides: Partial<NudgeCandidate> & Pick<NudgeCandidate, 'engramIds'>
): NudgeCandidate {
  return {
    type: 'pattern',
    title: 't',
    body: 'b',
    priority: 'medium',
    expiresAt: null,
    action: null,
    ...overrides,
  };
}

interface SeedRow {
  id: string;
  type?: 'pattern' | 'staleness' | 'consolidation' | 'insight';
  status?: 'pending' | 'dismissed' | 'acted' | 'expired';
  priority?: 'low' | 'medium' | 'high';
  createdAt: string;
  actionParams?: Record<string, unknown> | null;
}

function seed(db: CerebrumDb, rows: SeedRow[]): void {
  for (const r of rows) {
    db.insert(nudgeLog)
      .values({
        id: r.id,
        type: r.type ?? 'pattern',
        title: 'T',
        body: 'B',
        engramIds: JSON.stringify(['eA', 'eB']),
        priority: r.priority ?? 'medium',
        status: r.status ?? 'pending',
        createdAt: r.createdAt,
        actionType: r.actionParams === null ? null : 'link',
        actionLabel: r.actionParams === null ? null : 'Open',
        actionParams:
          r.actionParams === null || r.actionParams === undefined
            ? null
            : JSON.stringify(r.actionParams),
      })
      .run();
  }
}

describe('persistCandidates', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns 0 when given an empty list', () => {
    expect(persistCandidates(db, [], defaultThresholds())).toBe(0);
  });

  it('inserts each candidate and returns the count', () => {
    const candidates = [
      candidate({ engramIds: ['e1'], title: 'A' }),
      candidate({ engramIds: ['e2'], title: 'B' }),
    ];
    expect(persistCandidates(db, candidates, defaultThresholds())).toBe(2);
    expect(db.select().from(nudgeLog).all()).toHaveLength(2);
  });

  it('serialises the action payload through JSON for later read-back', () => {
    const action: NudgeAction = { type: 'link', label: 'Open', params: { url: '/x' } };
    persistCandidates(db, [candidate({ engramIds: ['e1'], action })], defaultThresholds());
    const [row] = db.select().from(nudgeLog).all();
    expect(row?.actionType).toBe('link');
    expect(row?.actionLabel).toBe('Open');
    expect(JSON.parse(row?.actionParams ?? 'null')).toEqual({ url: '/x' });
  });

  it('skips a candidate whose (type, sorted engramIds) is already inside the cooldown window', () => {
    const now = (): Date => new Date('2026-05-12T10:00:00Z');
    persistCandidates(
      db,
      [candidate({ engramIds: ['e2', 'e1'], type: 'pattern' })],
      defaultThresholds(),
      now
    );
    // Second call within cooldown — engramIds order reversed to assert sort.
    const created = persistCandidates(
      db,
      [candidate({ engramIds: ['e1', 'e2'], type: 'pattern' })],
      defaultThresholds(),
      now
    );
    expect(created).toBe(0);
    expect(db.select().from(nudgeLog).all()).toHaveLength(1);
  });

  it('does NOT skip when type differs even for the same engrams', () => {
    const now = (): Date => new Date('2026-05-12T10:00:00Z');
    persistCandidates(
      db,
      [candidate({ engramIds: ['e1'], type: 'staleness' })],
      defaultThresholds(),
      now
    );
    expect(
      persistCandidates(
        db,
        [candidate({ engramIds: ['e1'], type: 'pattern' })],
        defaultThresholds(),
        now
      )
    ).toBe(1);
  });

  it('does NOT skip once the cooldown window has elapsed', () => {
    persistCandidates(
      db,
      [candidate({ engramIds: ['e1'], type: 'pattern' })],
      { nudgeCooldownHours: 24 },
      () => new Date('2026-05-10T10:00:00Z')
    );
    const created = persistCandidates(
      db,
      [candidate({ engramIds: ['e1'], type: 'pattern' })],
      { nudgeCooldownHours: 24 },
      () => new Date('2026-05-12T10:00:00Z')
    );
    expect(created).toBe(1);
  });
});

describe('listContradictions', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns an empty page when nothing is seeded', () => {
    expect(listContradictions(db, {})).toEqual({ nudges: [], total: 0 });
  });

  it('excludes pattern rows missing the contradiction action_params shape', () => {
    seed(db, [
      {
        id: 'n_contradict',
        createdAt: '2026-05-10T10:00:00Z',
        actionParams: CONTRADICTION_PARAMS,
      },
      // Recurring pattern (no contradiction key) — must be filtered out.
      {
        id: 'n_recurring',
        createdAt: '2026-05-09T10:00:00Z',
        actionParams: { topic: 'foo', engramIds: ['eA'] },
      },
      // Non-pattern nudge — excluded by the type filter.
      {
        id: 'n_staleness',
        type: 'staleness',
        createdAt: '2026-05-08T10:00:00Z',
        actionParams: { engramId: 'eA' },
      },
    ]);

    const result = listContradictions(db, { status: 'pending' });
    expect(result.nudges.map((n) => n.id)).toEqual(['n_contradict']);
    expect(result.total).toBe(1);
  });

  it('orders by createdAt desc and paginates after the contradiction filter', () => {
    const rows: SeedRow[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push({
        id: `n_${i}`,
        createdAt: `2026-05-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
        actionParams: CONTRADICTION_PARAMS,
      });
    }
    seed(db, rows);

    const page1 = listContradictions(db, { limit: 2 });
    expect(page1.total).toBe(5);
    expect(page1.nudges.map((n) => n.id)).toEqual(['n_4', 'n_3']);

    const page2 = listContradictions(db, { limit: 2, offset: 2 });
    expect(page2.nudges.map((n) => n.id)).toEqual(['n_2', 'n_1']);
  });

  it('omits the status condition when status is null or undefined', () => {
    seed(db, [
      {
        id: 'pending',
        createdAt: '2026-05-10T10:00:00Z',
        actionParams: CONTRADICTION_PARAMS,
      },
      {
        id: 'dismissed',
        status: 'dismissed',
        createdAt: '2026-05-09T10:00:00Z',
        actionParams: CONTRADICTION_PARAMS,
      },
    ]);
    expect(listContradictions(db, {}).total).toBe(2);
    expect(listContradictions(db, { status: null }).total).toBe(2);
    expect(listContradictions(db, { status: 'pending' }).total).toBe(1);
  });
});

describe('enforcePendingCap', () => {
  let db: CerebrumDb;
  beforeEach(() => {
    db = freshDb();
  });

  it('returns 0 when the pending set is at or below the cap', () => {
    seed(db, [{ id: 'a', createdAt: '2026-05-10T10:00:00Z', actionParams: null }]);
    expect(enforcePendingCap(db, 5)).toBe(0);
  });

  it('only counts pending rows toward the cap', () => {
    seed(db, [
      { id: 'd_0', status: 'dismissed', createdAt: '2026-05-10T10:00:00Z', actionParams: null },
      { id: 'd_1', status: 'dismissed', createdAt: '2026-05-11T10:00:00Z', actionParams: null },
      { id: 'd_2', status: 'dismissed', createdAt: '2026-05-12T10:00:00Z', actionParams: null },
      { id: 'p_0', status: 'pending', createdAt: '2026-05-10T10:00:00Z', actionParams: null },
    ]);
    expect(enforcePendingCap(db, 1)).toBe(0);
  });

  it('expires the oldest pending rows to bring the set under the cap', () => {
    const rows: SeedRow[] = [];
    for (let i = 0; i < 5; i++) {
      rows.push({
        id: `p_${i}`,
        status: 'pending',
        createdAt: `2026-05-${String(10 + i).padStart(2, '0')}T10:00:00Z`,
        actionParams: null,
      });
    }
    seed(db, rows);

    const expired = enforcePendingCap(db, 2);
    expect(expired).toBe(3);

    const persisted = db.select().from(nudgeLog).orderBy(nudgeLog.createdAt).all();
    const statuses = Object.fromEntries(persisted.map((r) => [r.id, r.status]));
    expect(statuses).toEqual({
      p_0: 'expired',
      p_1: 'expired',
      p_2: 'expired',
      p_3: 'pending',
      p_4: 'pending',
    });
  });
});

describe('generateNudgeId', () => {
  it('formats as nudge_{YYYYMMDD}_{HHmm}_{type}_{slug}', () => {
    const id = generateNudgeId('pattern', new Date('2026-05-12T09:07:00Z'));
    // The date+time tail uses local time; assert structural shape rather
    // than the wall-clock numerics so the test is timezone-stable.
    expect(id).toMatch(/^nudge_\d{8}_\d{4}_pattern_[a-z0-9]{1,6}$/);
  });
});

describe('rowToNudge', () => {
  it('parses engramIds and the action payload', () => {
    const mapped = rowToNudge({
      id: 'n_x',
      type: 'pattern',
      title: 'T',
      body: 'B',
      engramIds: JSON.stringify(['e1', 'e2']),
      priority: 'high',
      status: 'pending',
      createdAt: '2026-05-12T10:00:00Z',
      expiresAt: null,
      actedAt: null,
      actionType: 'link',
      actionLabel: 'Open',
      actionParams: JSON.stringify({ url: '/x' }),
    });
    expect(mapped.engramIds).toEqual(['e1', 'e2']);
    expect(mapped.action).toEqual({ type: 'link', label: 'Open', params: { url: '/x' } });
  });

  it('returns null action when actionType is missing', () => {
    const mapped = rowToNudge({
      id: 'n_x',
      type: 'pattern',
      title: 'T',
      body: 'B',
      engramIds: JSON.stringify([]),
      priority: 'medium',
      status: 'pending',
      createdAt: '2026-05-12T10:00:00Z',
      expiresAt: null,
      actedAt: null,
      actionType: null,
      actionLabel: null,
      actionParams: null,
    });
    expect(mapped.action).toBeNull();
  });
});
