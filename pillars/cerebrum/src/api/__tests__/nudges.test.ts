/**
 * Integration tests for `cerebrum.nudges.*` over REST (PRD-084).
 *
 * Boots the app against a per-test temp `cerebrum.db` (nudge_log present via
 * migrations 0039/0044) and seeds `nudge_log` rows directly through the
 * drizzle handle. Covers the read/dismiss surface only — `scan`/`act`/
 * `configure` are deferred to a post-retrieval slice.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  type CerebrumDb,
  type NudgePriority,
  type NudgeStatus,
  type NudgeType,
  nudgeLog,
  openCerebrumDb,
  type OpenedCerebrumDb,
} from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { HttpError, makeClient, makeReflexService, makeTemplateRegistry } from './test-utils.js';

interface SeedNudge {
  id: string;
  type?: NudgeType;
  title?: string;
  body?: string;
  engramIds?: string[];
  priority?: NudgePriority;
  status?: NudgeStatus;
  createdAt: string;
  action?: { type: string; label: string; params: Record<string, unknown> } | null;
}

function seedNudge(db: CerebrumDb, n: SeedNudge): void {
  const action = n.action ?? null;
  db.insert(nudgeLog)
    .values({
      id: n.id,
      type: n.type ?? 'insight',
      title: n.title ?? n.id,
      body: n.body ?? '',
      engramIds: JSON.stringify(n.engramIds ?? []),
      priority: n.priority ?? 'medium',
      status: n.status ?? 'pending',
      createdAt: n.createdAt,
      expiresAt: null,
      actedAt: null,
      actionType: action?.type ?? null,
      actionLabel: action?.label ?? null,
      actionParams: action ? JSON.stringify(action.params) : null,
    })
    .run();
}

function contradictionAction(over: Partial<Record<string, string>> = {}): {
  type: string;
  label: string;
  params: Record<string, unknown>;
} {
  return {
    type: 'review',
    label: 'Resolve contradiction',
    params: {
      contradiction: {
        engramA: over.engramA ?? 'eng_a',
        engramB: over.engramB ?? 'eng_b',
        excerptA: over.excerptA ?? 'A says yes',
        excerptB: over.excerptB ?? 'B says no',
        conflict: over.conflict ?? 'They disagree',
      },
    },
  };
}

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-nudges-test-'));
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
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
    })
  );
}

describe('cerebrum.nudges.list', () => {
  it('returns an empty page when nudge_log is empty', async () => {
    const { nudges, total } = await client().nudges.list();
    expect(nudges).toEqual([]);
    expect(total).toBe(0);
  });

  it('lists newest-first and round-trips the full nudge shape', async () => {
    const db = cerebrumDb.db;
    seedNudge(db, {
      id: 'nudge_a',
      type: 'consolidation',
      title: 'Older',
      body: 'first',
      engramIds: ['eng_1', 'eng_2'],
      priority: 'low',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    seedNudge(db, {
      id: 'nudge_b',
      type: 'staleness',
      title: 'Newer',
      priority: 'high',
      createdAt: '2026-02-01T00:00:00.000Z',
    });

    const { nudges, total } = await client().nudges.list();
    expect(total).toBe(2);
    expect(nudges.map((n) => n.id)).toEqual(['nudge_b', 'nudge_a']);
    expect(nudges[1]).toMatchObject({
      id: 'nudge_a',
      type: 'consolidation',
      title: 'Older',
      body: 'first',
      engramIds: ['eng_1', 'eng_2'],
      priority: 'low',
      status: 'pending',
      action: null,
    });
  });

  it('filters by type, status and priority', async () => {
    const db = cerebrumDb.db;
    seedNudge(db, {
      id: 'n_pattern_pending',
      type: 'pattern',
      status: 'pending',
      priority: 'high',
      createdAt: '2026-03-01T00:00:00.000Z',
    });
    seedNudge(db, {
      id: 'n_pattern_dismissed',
      type: 'pattern',
      status: 'dismissed',
      priority: 'high',
      createdAt: '2026-03-02T00:00:00.000Z',
    });
    seedNudge(db, {
      id: 'n_insight_pending',
      type: 'insight',
      status: 'pending',
      priority: 'low',
      createdAt: '2026-03-03T00:00:00.000Z',
    });

    const c = client();

    const byType = await c.nudges.list({ type: 'pattern' });
    expect(byType.total).toBe(2);
    expect(byType.nudges.map((n) => n.id).toSorted()).toEqual([
      'n_pattern_dismissed',
      'n_pattern_pending',
    ]);

    const byStatus = await c.nudges.list({ status: 'pending' });
    expect(byStatus.total).toBe(2);

    const byPriority = await c.nudges.list({
      type: 'pattern',
      priority: 'high',
      status: 'pending',
    });
    expect(byPriority.total).toBe(1);
    expect(byPriority.nudges[0]?.id).toBe('n_pattern_pending');
  });

  it('paginates with limit/offset while reporting the unpaged total', async () => {
    const db = cerebrumDb.db;
    for (let i = 0; i < 5; i++) {
      seedNudge(db, {
        id: `n_${i}`,
        createdAt: `2026-04-0${i + 1}T00:00:00.000Z`,
      });
    }
    const page = await client().nudges.list({ limit: 2, offset: 1 });
    expect(page.total).toBe(5);
    expect(page.nudges.map((n) => n.id)).toEqual(['n_3', 'n_2']);
  });
});

describe('cerebrum.nudges.get', () => {
  it('returns the nudge by id', async () => {
    seedNudge(cerebrumDb.db, {
      id: 'nudge_get',
      title: 'Findable',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const { nudge } = await client().nudges.get('nudge_get');
    expect(nudge).toMatchObject({ id: 'nudge_get', title: 'Findable' });
  });

  it('404s on an unknown id', async () => {
    await expect(client().nudges.get('does_not_exist')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('cerebrum.nudges.dismiss', () => {
  it('dismisses a pending nudge', async () => {
    seedNudge(cerebrumDb.db, {
      id: 'nudge_pending',
      status: 'pending',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const c = client();
    const result = await c.nudges.dismiss('nudge_pending');
    expect(result).toEqual({ success: true });

    const { nudge } = await c.nudges.get('nudge_pending');
    expect(nudge.status).toBe('dismissed');
  });

  it('404s when the nudge is missing', async () => {
    await expect(client().nudges.dismiss('ghost')).rejects.toMatchObject({ status: 404 });
  });

  it('409s when the nudge is not pending', async () => {
    seedNudge(cerebrumDb.db, {
      id: 'nudge_done',
      status: 'dismissed',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const err = await client()
      .nudges.dismiss('nudge_done')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    if (!(err instanceof HttpError)) throw new Error('expected HttpError');
    expect(err.status).toBe(409);
    expect(err.body).toMatchObject({ code: 'ConflictError' });
  });
});

describe('cerebrum.nudges.contradictions', () => {
  it('projects contradiction-pattern nudges to structured evidence', async () => {
    const db = cerebrumDb.db;
    seedNudge(db, {
      id: 'n_contradiction',
      type: 'pattern',
      status: 'pending',
      priority: 'high',
      title: 'Contradiction found',
      createdAt: '2026-05-01T00:00:00.000Z',
      action: contradictionAction({ conflict: 'X vs Y' }),
    });
    // A non-contradiction pattern nudge must not leak into the projection.
    seedNudge(db, {
      id: 'n_recurring',
      type: 'pattern',
      status: 'pending',
      createdAt: '2026-05-02T00:00:00.000Z',
      action: { type: 'review', label: 'Review', params: { recurring: { topic: 'x' } } },
    });

    const { contradictions, total } = await client().nudges.contradictions();
    expect(total).toBe(1);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0]).toEqual({
      id: 'n_contradiction',
      createdAt: '2026-05-01T00:00:00.000Z',
      status: 'pending',
      priority: 'high',
      title: 'Contradiction found',
      engramA: 'eng_a',
      engramB: 'eng_b',
      excerptA: 'A says yes',
      excerptB: 'B says no',
      conflict: 'X vs Y',
    });
  });

  it('defaults to pending and excludes dismissed contradictions', async () => {
    const db = cerebrumDb.db;
    seedNudge(db, {
      id: 'n_pending',
      type: 'pattern',
      status: 'pending',
      createdAt: '2026-06-01T00:00:00.000Z',
      action: contradictionAction({ engramA: 'eng_p1', engramB: 'eng_p2' }),
    });
    seedNudge(db, {
      id: 'n_dismissed',
      type: 'pattern',
      status: 'dismissed',
      createdAt: '2026-06-02T00:00:00.000Z',
      action: contradictionAction({ engramA: 'eng_d1', engramB: 'eng_d2' }),
    });

    const c = client();

    const defaulted = await c.nudges.contradictions();
    expect(defaulted.total).toBe(1);
    expect(defaulted.contradictions[0]?.id).toBe('n_pending');

    const all = await c.nudges.contradictions({ status: null });
    expect(all.total).toBe(2);
  });

  it('returns an empty projection when there are no contradictions', async () => {
    const { contradictions, total } = await client().nudges.contradictions();
    expect(contradictions).toEqual([]);
    expect(total).toBe(0);
  });
});
