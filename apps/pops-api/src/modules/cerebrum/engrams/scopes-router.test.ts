import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { appRouter } from '../../../router.js';
import { createTestDb } from '../../../shared/test-utils.js';
import { resetCerebrumCache } from '../instance.js';
import { TemplateRegistry } from '../templates/registry.js';
import { seedDefaultTemplates } from '../templates/seed.js';
import { listScopes } from './scopes-router.js';
import { EngramService } from './service.js';

import type { Database } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A fixed clock that advances one minute per call. */
function makeClock(start = new Date('2026-04-18T09:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
}

function makeService(db: BetterSQLite3Database, root: string): EngramService {
  const templatesDir = join(root, '.templates');
  seedDefaultTemplates(templatesDir);
  return new EngramService({
    root,
    db,
    templates: new TemplateRegistry(templatesDir),
    now: makeClock(),
  });
}

// ---------------------------------------------------------------------------
// listScopes (pure DB helper)
// ---------------------------------------------------------------------------

describe('listScopes', () => {
  let rawDb: Database;
  let db: BetterSQLite3Database;
  let service: EngramService;
  let root: string;

  beforeEach(() => {
    rawDb = createTestDb();
    db = drizzle(rawDb);
    root = mkdtempSync(join(tmpdir(), 'scopes-router-'));
    service = makeService(db, root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rawDb.close();
  });

  it('returns all scopes with counts', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'B', body: '# B', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'C', body: '# C', scopes: ['personal.journal'] });

    const scopes = listScopes(db);
    const wp = scopes.find((s) => s.scope === 'work.projects');
    const pj = scopes.find((s) => s.scope === 'personal.journal');
    expect(wp?.count).toBe(2);
    expect(pj?.count).toBe(1);
  });

  it('filters by prefix', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'B', body: '# B', scopes: ['personal.journal'] });

    const scopes = listScopes(db, 'work');
    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.scope).toBe('work.projects');
  });

  it('returns empty when no engrams', () => {
    expect(listScopes(db)).toHaveLength(0);
  });

  it('handles engram with multiple scopes', () => {
    service.create({
      type: 'note',
      title: 'Multi',
      body: '# M',
      scopes: ['work.projects', 'work.meetings'],
    });
    const scopes = listScopes(db, 'work');
    expect(scopes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// EngramService scope inference integration
// ---------------------------------------------------------------------------

describe('EngramService.create scope inference', () => {
  let rawDb: Database;
  let db: BetterSQLite3Database;
  let root: string;

  beforeEach(() => {
    rawDb = createTestDb();
    db = drizzle(rawDb);
    root = mkdtempSync(join(tmpdir(), 'scope-infer-'));
    mkdirSync(join(root, '.config'), { recursive: true });
    mkdirSync(join(root, '.templates'), { recursive: true });
    seedDefaultTemplates(join(root, '.templates'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rawDb.close();
  });

  it('uses explicit scopes when provided (no rule engine needed)', () => {
    const service = makeService(db, root);
    const engram = service.create({
      type: 'note',
      title: 'Explicit',
      body: '# E',
      scopes: ['work.projects'],
    });
    expect(engram.scopes).toEqual(['work.projects']);
  });

  it('still throws without scopes when no rule engine configured', () => {
    const service = makeService(db, root);
    expect(() => service.create({ type: 'note', title: 'No scope', body: '# x' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// cerebrum.scopes tRPC procedures
// ---------------------------------------------------------------------------

function createCaller() {
  return appRouter.createCaller({ user: { email: 'test@example.com' } });
}

describe('cerebrum.scopes tRPC procedures', () => {
  let rawDb: Database;
  let root: string;
  let previousRoot: string | undefined;

  beforeEach(() => {
    rawDb = createTestDb();
    setDb(rawDb);
    root = mkdtempSync(join(tmpdir(), 'scopes-trpc-'));
    previousRoot = process.env['ENGRAM_ROOT'];
    process.env['ENGRAM_ROOT'] = root;
    resetCerebrumCache();
  });

  afterEach(() => {
    closeDb();
    rmSync(root, { recursive: true, force: true });
    if (previousRoot === undefined) delete process.env['ENGRAM_ROOT'];
    else process.env['ENGRAM_ROOT'] = previousRoot;
    resetCerebrumCache();
  });

  // ---- assign ----

  describe('assign', () => {
    it('adds scopes to an engram', async () => {
      const caller = createCaller();
      const { engram } = await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Assign target',
        body: '# x',
        scopes: ['work.projects'],
      });
      const { engram: updated } = await caller.cerebrum.scopes.assign({
        engramId: engram.id,
        scopes: ['personal.journal'],
      });
      expect(updated.scopes).toContain('work.projects');
      expect(updated.scopes).toContain('personal.journal');
    });

    it('deduplicates scopes — assigning an existing scope is a no-op', async () => {
      const caller = createCaller();
      const { engram } = await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Dup',
        body: '# x',
        scopes: ['work.projects'],
      });
      const { engram: updated } = await caller.cerebrum.scopes.assign({
        engramId: engram.id,
        scopes: ['work.projects'],
      });
      expect(updated.scopes.filter((s) => s === 'work.projects')).toHaveLength(1);
    });

    it('rejects invalid scope format', async () => {
      const caller = createCaller();
      const { engram } = await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Fmt',
        body: '# x',
        scopes: ['work.projects'],
      });
      await expect(
        caller.cerebrum.scopes.assign({ engramId: engram.id, scopes: ['bad scope!'] })
      ).rejects.toThrow();
    });

    it('rejects 1-segment scope (assign requires full scope, not prefix)', async () => {
      const caller = createCaller();
      const { engram } = await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Seg',
        body: '# x',
        scopes: ['work.projects'],
      });
      await expect(
        caller.cerebrum.scopes.assign({ engramId: engram.id, scopes: ['work'] })
      ).rejects.toThrow();
    });
  });

  // ---- remove ----

  describe('remove', () => {
    it('removes a scope from an engram', async () => {
      const caller = createCaller();
      const { engram } = await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Remove target',
        body: '# x',
        scopes: ['work.projects', 'personal.journal'],
      });
      const { engram: updated } = await caller.cerebrum.scopes.remove({
        engramId: engram.id,
        scopes: ['work.projects'],
      });
      expect(updated.scopes).not.toContain('work.projects');
      expect(updated.scopes).toContain('personal.journal');
    });

    it('rejects removing the last scope', async () => {
      const caller = createCaller();
      const { engram } = await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Last',
        body: '# x',
        scopes: ['work.projects'],
      });
      await expect(
        caller.cerebrum.scopes.remove({ engramId: engram.id, scopes: ['work.projects'] })
      ).rejects.toThrow(/last scope/i);
    });
  });

  // ---- reclassify ----

  describe('reclassify', () => {
    it('renames a scope prefix across matching engrams', async () => {
      const caller = createCaller();
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'A',
        body: '# A',
        scopes: ['work.projects'],
      });
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'B',
        body: '# B',
        scopes: ['work.meetings'],
      });

      const result = await caller.cerebrum.scopes.reclassify({
        fromScope: 'work',
        toScope: 'office',
      });
      expect(result.affected).toBe(2);

      const { scopes } = await caller.cerebrum.scopes.list({ prefix: 'office' });
      const scopeNames = scopes.map((s) => s.scope);
      expect(scopeNames).toContain('office.projects');
      expect(scopeNames).toContain('office.meetings');

      const workScopes = await caller.cerebrum.scopes.list({ prefix: 'work' });
      expect(workScopes.scopes).toHaveLength(0);
    });

    it('reclassifies with single-segment fromScope and toScope', async () => {
      const caller = createCaller();
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Deep',
        body: '# D',
        scopes: ['work.team.alpha'],
      });

      const result = await caller.cerebrum.scopes.reclassify({
        fromScope: 'work',
        toScope: 'job',
      });
      expect(result.affected).toBe(1);

      const { scopes } = await caller.cerebrum.scopes.list({ prefix: 'job' });
      expect(scopes.map((s) => s.scope)).toContain('job.team.alpha');
    });

    it('dry-run returns count without modifying anything', async () => {
      const caller = createCaller();
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Dry',
        body: '# D',
        scopes: ['work.projects'],
      });

      const result = await caller.cerebrum.scopes.reclassify({
        fromScope: 'work',
        toScope: 'office',
        dryRun: true,
      });
      expect(result.affected).toBe(1);

      // Scope should remain unchanged after dry run.
      const { scopes } = await caller.cerebrum.scopes.list({ prefix: 'work' });
      expect(scopes.map((s) => s.scope)).toContain('work.projects');
    });

    it('returns affected: 0 when no engrams match fromScope', async () => {
      const caller = createCaller();
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Unrelated',
        body: '# U',
        scopes: ['personal.journal'],
      });

      const result = await caller.cerebrum.scopes.reclassify({
        fromScope: 'work',
        toScope: 'office',
      });
      expect(result.affected).toBe(0);
    });
  });

  // ---- filter ----

  describe('filter', () => {
    it('returns engrams matching the scope prefix', async () => {
      const caller = createCaller();
      const { engram: a } = await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Work note',
        body: '# Work note',
        scopes: ['work.projects'],
      });
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Personal note',
        body: '# Personal note',
        scopes: ['personal.journal'],
      });

      const { engrams } = await caller.cerebrum.scopes.filter({ scopes: ['work'] });
      expect(engrams).toHaveLength(1);
      expect(engrams[0]?.id).toBe(a.id);
    });

    it('hard-blocks secret-scoped engrams by default', async () => {
      const caller = createCaller();
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Secret note',
        body: '# Secret note',
        scopes: ['work.secret.jobsearch'],
      });
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Public note',
        body: '# Public note',
        scopes: ['work.projects'],
      });

      const { engrams } = await caller.cerebrum.scopes.filter({ scopes: ['work'] });
      const titles = engrams.map((e) => e.title);
      expect(titles).not.toContain('Secret note');
      expect(titles).toContain('Public note');
    });

    it('includes secret-scoped engrams when includeSecret is true', async () => {
      const caller = createCaller();
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Secret note',
        body: '# Secret note',
        scopes: ['work.secret.jobsearch'],
      });

      const { engrams } = await caller.cerebrum.scopes.filter({
        scopes: ['work'],
        includeSecret: true,
      });
      expect(engrams.map((e) => e.title)).toContain('Secret note');
    });

    it('hard-blocks secret scopes at any segment position', async () => {
      const caller = createCaller();
      // secret in the middle
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Mid secret',
        body: '# Mid secret',
        scopes: ['work.secret.jobs'],
      });
      // secret at the end
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Trailing secret',
        body: '# Trailing secret',
        scopes: ['work.plans.secret'],
      });
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Public',
        body: '# Public',
        scopes: ['work.projects'],
      });

      const { engrams } = await caller.cerebrum.scopes.filter({ scopes: ['work'] });
      const titles = engrams.map((e) => e.title);
      expect(titles).not.toContain('Mid secret');
      expect(titles).not.toContain('Trailing secret');
      expect(titles).toContain('Public');
    });

    it('returns empty array when no scopes match', async () => {
      const caller = createCaller();
      await caller.cerebrum.engrams.create({
        type: 'note',
        title: 'Work note',
        body: '# Work note',
        scopes: ['work.projects'],
      });

      const { engrams } = await caller.cerebrum.scopes.filter({ scopes: ['personal'] });
      expect(engrams).toHaveLength(0);
    });
  });
});
