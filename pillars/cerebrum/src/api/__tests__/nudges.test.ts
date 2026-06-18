/**
 * Integration tests for `cerebrum.nudges.*` over REST (PRD-084).
 *
 * Boots the app against a per-test temp `cerebrum.db` (nudge_log present via
 * migrations 0039/0044) and seeds `nudge_log` rows directly through the
 * drizzle handle. Covers the full surface: read/dismiss/contradictions plus the
 * write surface (`scan` / `act` / `configure`). Write-surface tests seed real
 * engrams through a test {@link EngramService} (backdated `now` for staleness)
 * and inject an offline contradiction analyzer — no real API is reached.
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
import { EngramService } from '../modules/engrams/service.js';
import { resetCitationCounts } from '../modules/nudges/detectors/citation-tracker.js';
import {
  HttpError,
  makeClient,
  makeEmptyPeerClients,
  makeFakeContradictionAnalyzer,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

import type { ContradictionAnalyzer } from '../modules/nudges/contradiction-analyzer.js';
import type { TemplateRegistry } from '../modules/templates/registry.js';

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
let engramRoot: string;
let templateRegistry: TemplateRegistry;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-nudges-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-nudges-root-'));
  templateRegistry = makeTemplateRegistry();
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
  resetCitationCounts();
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function client(analyzer?: ContradictionAnalyzer) {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry,
      engramRoot,
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
      nudgeContradictionAnalyzer: analyzer,
    })
  );
}

/**
 * Build a test {@link EngramService} bound to the same db / root / templates as
 * the app, with an optional backdated `now` so created engrams carry old
 * `created`/`modified` timestamps (needed to exercise the staleness detector).
 */
function engramService(now?: () => Date): EngramService {
  return new EngramService({
    root: engramRoot,
    db: cerebrumDb.db,
    templates: templateRegistry,
    now,
  });
}

describe('cerebrum.nudges.create', () => {
  it('persists an insight nudge and surfaces it in get/list', async () => {
    const c = client();

    const { nudge } = await c.nudges.create({
      title: 'AI alert: budget-threshold',
      body: 'Monthly spend exceeded the cap (provider=openai)',
      priority: 'high',
      action: {
        type: 'review',
        label: 'Inspect alert',
        params: { source: 'ai-alert', alertId: 42 },
      },
    });

    expect(nudge).toMatchObject({
      type: 'insight',
      title: 'AI alert: budget-threshold',
      body: 'Monthly spend exceeded the cap (provider=openai)',
      priority: 'high',
      status: 'pending',
      engramIds: [],
      expiresAt: null,
      actedAt: null,
      action: {
        type: 'review',
        label: 'Inspect alert',
        params: { source: 'ai-alert', alertId: 42 },
      },
    });
    expect(nudge.id).toMatch(/^nudge_\d{8}_\d{4}_insight_/);

    const fetched = await c.nudges.get(nudge.id);
    expect(fetched.nudge).toMatchObject({ id: nudge.id, title: 'AI alert: budget-threshold' });

    const listed = await c.nudges.list({ type: 'insight' });
    expect(listed.total).toBe(1);
    expect(listed.nudges[0]?.id).toBe(nudge.id);
  });

  it('defaults type to insight, engramIds to [], action to null', async () => {
    const c = client();
    const { nudge } = await c.nudges.create({
      title: 'Bare nudge',
      body: 'no action, no engrams',
      priority: 'medium',
    });
    expect(nudge.type).toBe('insight');
    expect(nudge.engramIds).toEqual([]);
    expect(nudge.action).toBeNull();
    expect(nudge.status).toBe('pending');
  });

  it('does not dedup repeated alert-driven creates (no cooldown)', async () => {
    const c = client();
    const payload = {
      title: 'AI alert: error-spike',
      body: 'errors spiking',
      priority: 'high' as const,
    };
    const first = await c.nudges.create(payload);
    const second = await c.nudges.create(payload);
    expect(first.nudge.id).not.toBe(second.nudge.id);

    const { total } = await c.nudges.list({ type: 'insight' });
    expect(total).toBe(2);
  });
});

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

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): () => Date {
  const fixed = new Date(Date.now() - days * DAY_MS);
  return () => fixed;
}

describe('cerebrum.nudges.scan', () => {
  it('runs the staleness detector over old engrams and persists nudges', async () => {
    const svc = engramService(daysAgo(200));
    svc.create({ type: 'note', title: 'Ancient One', body: 'a', scopes: ['work.alpha'] });
    svc.create({ type: 'note', title: 'Ancient Two', body: 'b', scopes: ['work.beta'] });

    const c = client();
    const { created } = await c.nudges.scan({ type: 'staleness' });
    expect(created).toBe(2);

    const { nudges, total } = await c.nudges.list({ type: 'staleness' });
    expect(total).toBe(2);
    expect(nudges.every((n) => n.action?.type === 'review')).toBe(true);
  });

  it('feeds the contradiction pass through the injected analyzer', async () => {
    const svc = engramService();
    svc.create({
      type: 'note',
      title: 'Pro',
      body: 'Coffee is great for focus.',
      scopes: ['work.research'],
      tags: ['coffee'],
    });
    svc.create({
      type: 'note',
      title: 'Con',
      body: 'Coffee wrecks focus.',
      scopes: ['work.research'],
      tags: ['coffee'],
    });

    const analyzer = makeFakeContradictionAnalyzer((engramA, _bodyA, engramB) => ({
      engramA,
      engramB,
      excerptA: 'Coffee is great for focus.',
      excerptB: 'Coffee wrecks focus.',
      conflict: 'One says coffee helps focus, the other says it harms it.',
    }));

    const c = client(analyzer);
    const { created } = await c.nudges.scan({ type: 'pattern' });
    expect(created).toBe(1);

    const { contradictions, total } = await c.nudges.contradictions();
    expect(total).toBe(1);
    expect(contradictions[0]).toMatchObject({
      conflict: 'One says coffee helps focus, the other says it harms it.',
      excerptA: 'Coffee is great for focus.',
      excerptB: 'Coffee wrecks focus.',
    });
  });

  it('surfaces no contradictions when no analyzer is wired (noop path)', async () => {
    const svc = engramService();
    svc.create({
      type: 'note',
      title: 'Pro',
      body: 'Coffee is great.',
      scopes: ['work.research'],
      tags: ['coffee'],
    });
    svc.create({
      type: 'note',
      title: 'Con',
      body: 'Coffee is bad.',
      scopes: ['work.research'],
      tags: ['coffee'],
    });

    const c = client();
    const { created } = await c.nudges.scan({ type: 'pattern' });
    expect(created).toBe(0);
  });
});

describe('cerebrum.nudges.act', () => {
  it('executes a review action and bumps the engram modified timestamp', async () => {
    const svc = engramService(daysAgo(100));
    const engram = svc.create({
      type: 'note',
      title: 'Reviewable',
      body: 'old',
      scopes: ['work.alpha'],
    });
    const before = engram.modified;

    seedNudge(cerebrumDb.db, {
      id: 'nudge_review',
      type: 'staleness',
      status: 'pending',
      engramIds: [engram.id],
      createdAt: '2026-01-01T00:00:00.000Z',
      action: { type: 'review', label: 'Mark as reviewed', params: { engramId: engram.id } },
    });

    const c = client();
    const { result } = await c.nudges.act('nudge_review');
    expect(result.success).toBe(true);
    expect(result.nudge?.status).toBe('acted');

    const { engram: after } = await c.engrams.get(engram.id);
    expect(after.modified > before).toBe(true);
  });

  it('executes an archive action and archives the engram', async () => {
    const svc = engramService();
    const engram = svc.create({
      type: 'note',
      title: 'Archivable',
      body: 'stale',
      scopes: ['work.alpha'],
    });

    seedNudge(cerebrumDb.db, {
      id: 'nudge_archive',
      type: 'staleness',
      status: 'pending',
      engramIds: [engram.id],
      createdAt: '2026-01-01T00:00:00.000Z',
      action: { type: 'archive', label: 'Archive', params: { engramId: engram.id } },
    });

    const c = client();
    const { result } = await c.nudges.act('nudge_archive');
    expect(result.success).toBe(true);

    const { engram: after } = await c.engrams.get(engram.id);
    expect(after.status).toBe('archived');
  });

  it('executes a consolidate action: merges sources and marks them consolidated', async () => {
    const svc = engramService();
    const a = svc.create({
      type: 'note',
      title: 'Source A',
      body: 'alpha body',
      scopes: ['work.alpha'],
      tags: ['t1'],
    });
    const b = svc.create({
      type: 'note',
      title: 'Source B',
      body: 'beta body',
      scopes: ['work.alpha'],
      tags: ['t2'],
    });

    seedNudge(cerebrumDb.db, {
      id: 'nudge_consolidate',
      type: 'consolidation',
      status: 'pending',
      engramIds: [a.id, b.id],
      createdAt: '2026-01-01T00:00:00.000Z',
      action: {
        type: 'consolidate',
        label: 'Merge',
        params: { engramIds: [a.id, b.id] },
      },
    });

    const c = client();
    const { result } = await c.nudges.act('nudge_consolidate');
    expect(result.success).toBe(true);

    const afterA = await c.engrams.get(a.id);
    const afterB = await c.engrams.get(b.id);
    expect(afterA.engram.status).toBe('consolidated');
    expect(afterB.engram.status).toBe('consolidated');

    const all = await c.engrams.search({});
    expect(all.total).toBe(3);
    const mergedRow = all.engrams.find((e) => e.id !== a.id && e.id !== b.id);
    expect(mergedRow).toBeDefined();
    if (!mergedRow) throw new Error('merged engram not found');
    expect(mergedRow.status).toBe('active');

    const { body } = await c.engrams.get(mergedRow.id);
    expect(body).toContain('alpha body');
    expect(body).toContain('beta body');
  });

  it('404s on a missing nudge and 409s on a non-pending nudge', async () => {
    await expect(client().nudges.act('ghost')).rejects.toMatchObject({ status: 404 });

    seedNudge(cerebrumDb.db, {
      id: 'nudge_acted',
      status: 'acted',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    await expect(client().nudges.act('nudge_acted')).rejects.toMatchObject({ status: 409 });
  });
});

describe('cerebrum.nudges.configure', () => {
  it('round-trips: a reconfigured staleness threshold changes the next scan', async () => {
    const svc = engramService(daysAgo(100));
    svc.create({ type: 'note', title: 'Hundred Days', body: 'x', scopes: ['work.alpha'] });

    const c = client();

    const raised = await c.nudges.configure({ stalenessDays: 200 });
    expect(raised).toEqual({ success: true });
    const afterRaise = await c.nudges.scan({ type: 'staleness' });
    expect(afterRaise.created).toBe(0);

    await c.nudges.configure({ stalenessDays: 50 });
    const afterLower = await c.nudges.scan({ type: 'staleness' });
    expect(afterLower.created).toBe(1);
  });
});
