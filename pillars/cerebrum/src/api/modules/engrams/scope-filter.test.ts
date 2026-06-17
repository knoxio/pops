import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type CerebrumDb, type OpenedCerebrumDb } from '../../../db/index.js';
import { TemplateRegistry } from '../templates/registry.js';
import { filterByScopes, inferScopesFromContext } from './scope-filter.js';
import { EngramService } from './service.js';

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'defaults');

/** A fixed clock that advances one minute per call. */
function makeClock(start = new Date('2026-04-18T09:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
}

describe('filterByScopes', () => {
  let opened: OpenedCerebrumDb;
  let db: CerebrumDb;
  let service: EngramService;
  let dbDir: string;
  let root: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'scope-filter-db-'));
    root = mkdtempSync(join(tmpdir(), 'scope-filter-root-'));
    opened = openCerebrumDb(join(dbDir, 'cerebrum.db'), { loadVec: false });
    db = opened.db;
    service = new EngramService({
      root,
      db,
      templates: new TemplateRegistry(TEMPLATES_DIR),
      now: makeClock(),
    });
  });

  afterEach(() => {
    opened.raw.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  });

  it('returns engrams matching a top-level scope prefix', () => {
    service.create({ type: 'note', title: 'W1', body: '# W1', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'P1', body: '# P1', scopes: ['personal.journal'] });

    const result = filterByScopes({ scopes: ['work'], db });
    expect(result.engramIds).toHaveLength(1);
  });

  it('matches nested scopes via prefix', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['work.projects.karbon'] });
    service.create({ type: 'note', title: 'B', body: '# B', scopes: ['work.meetings'] });
    service.create({ type: 'note', title: 'C', body: '# C', scopes: ['personal.journal'] });

    const result = filterByScopes({ scopes: ['work'], db });
    expect(result.engramIds).toHaveLength(2);
  });

  it('hard-blocks secret-scoped engrams by default', () => {
    service.create({ type: 'note', title: 'S', body: '# S', scopes: ['work.secret.jobsearch'] });
    service.create({ type: 'note', title: 'P', body: '# P', scopes: ['work.projects'] });

    const result = filterByScopes({ scopes: ['work'], db });
    expect(result.engramIds).toHaveLength(1); // secret blocked
  });

  it('includes secret-scoped engrams when includeSecret is true', () => {
    service.create({ type: 'note', title: 'S', body: '# S', scopes: ['work.secret.jobsearch'] });
    service.create({ type: 'note', title: 'P', body: '# P', scopes: ['work.projects'] });

    const result = filterByScopes({ scopes: ['work'], db, includeSecret: true });
    expect(result.engramIds).toHaveLength(2);
  });

  it('engram with BOTH secret and non-secret scope is blocked without opt-in', () => {
    service.create({
      type: 'note',
      title: 'Mixed',
      body: '# Mixed',
      scopes: ['work.projects.karbon', 'work.secret.jobsearch'],
    });

    const result = filterByScopes({ scopes: ['work'], db });
    expect(result.engramIds).toHaveLength(0); // most restrictive wins
  });

  it('engram with mixed scopes is included with includeSecret', () => {
    service.create({
      type: 'note',
      title: 'Mixed',
      body: '# Mixed',
      scopes: ['work.projects.karbon', 'work.secret.jobsearch'],
    });

    const result = filterByScopes({ scopes: ['work'], db, includeSecret: true });
    expect(result.engramIds).toHaveLength(1);
  });

  it('empty scopes returns all non-secret engrams', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'B', body: '# B', scopes: ['personal.journal'] });
    service.create({ type: 'note', title: 'S', body: '# S', scopes: ['personal.secret.therapy'] });

    const result = filterByScopes({ scopes: [], db });
    expect(result.engramIds).toHaveLength(2); // secret blocked
  });

  it('empty scopes with includeSecret returns all engrams', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'S', body: '# S', scopes: ['personal.secret.therapy'] });

    const result = filterByScopes({ scopes: [], db, includeSecret: true });
    expect(result.engramIds).toHaveLength(2);
  });

  it('non-matching prefix returns empty result', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['personal.journal'] });

    const result = filterByScopes({ scopes: ['storage'], db });
    expect(result.engramIds).toHaveLength(0);
  });

  it('multiple prefixes return union of matching engrams', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'B', body: '# B', scopes: ['personal.journal'] });
    service.create({ type: 'note', title: 'C', body: '# C', scopes: ['storage.recipes'] });

    const result = filterByScopes({ scopes: ['work', 'personal'], db });
    expect(result.engramIds).toHaveLength(2);
  });

  it('exact scope match works', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['work.projects'] });

    const result = filterByScopes({ scopes: ['work.projects'], db });
    expect(result.engramIds).toHaveLength(1);
  });

  it('returns no duplicates even when engram has multiple matching scopes', () => {
    service.create({
      type: 'note',
      title: 'A',
      body: '# A',
      scopes: ['work.projects', 'work.meetings'],
    });

    const result = filterByScopes({ scopes: ['work'], db });
    expect(result.engramIds).toHaveLength(1); // only once
  });
});

describe('inferScopesFromContext', () => {
  it('maps "work" to ["work"]', () => {
    expect(inferScopesFromContext('work')).toEqual(['work']);
  });

  it('maps "at work" to ["work"]', () => {
    expect(inferScopesFromContext('at work')).toEqual(['work']);
  });

  it('maps "personal" to ["personal"]', () => {
    expect(inferScopesFromContext('personal')).toEqual(['personal']);
  });

  it('maps "journal" to ["personal.journal"]', () => {
    expect(inferScopesFromContext('journal')).toEqual(['personal.journal']);
  });

  it('is case-insensitive', () => {
    expect(inferScopesFromContext('WORK')).toEqual(['work']);
    expect(inferScopesFromContext('Personal')).toEqual(['personal']);
  });

  it('returns empty array for unknown hint', () => {
    expect(inferScopesFromContext('completely unknown context xyz')).toEqual([]);
  });

  it('trims whitespace', () => {
    expect(inferScopesFromContext('  work  ')).toEqual(['work']);
  });
});
