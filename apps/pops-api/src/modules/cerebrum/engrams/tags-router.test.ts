/**
 * Tests for cerebrum.tags.list — tag autocomplete endpoint (PRD-081 US-01).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../../../shared/test-utils.js';
import { TemplateRegistry } from '../templates/registry.js';
import { seedDefaultTemplates } from '../templates/seed.js';
import { EngramService } from './service.js';
import { listTags } from './tags-router.js';

import type { Database } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

function makeService(db: BetterSQLite3Database, root: string): EngramService {
  const templatesDir = join(root, '.templates');
  seedDefaultTemplates(templatesDir);
  return new EngramService({
    root,
    db,
    templates: new TemplateRegistry(templatesDir),
  });
}

describe('listTags', () => {
  let rawDb: Database;
  let db: BetterSQLite3Database;
  let service: EngramService;
  let root: string;

  beforeEach(() => {
    rawDb = createTestDb();
    db = drizzle(rawDb);
    root = mkdtempSync(join(tmpdir(), 'tags-router-'));
    service = makeService(db, root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rawDb.close();
  });

  it('returns empty array when no engrams exist', () => {
    expect(listTags(db)).toEqual([]);
  });

  it('returns distinct tags with usage counts', () => {
    service.create({
      type: 'note',
      title: 'A',
      body: '# A',
      scopes: ['work.projects'],
      tags: ['react', 'typescript'],
    });
    service.create({
      type: 'note',
      title: 'B',
      body: '# B',
      scopes: ['work.projects'],
      tags: ['react', 'testing'],
    });

    const tags = listTags(db);
    const react = tags.find((t) => t.tag === 'react');
    const typescript = tags.find((t) => t.tag === 'typescript');
    const testing = tags.find((t) => t.tag === 'testing');
    expect(react?.count).toBe(2);
    expect(typescript?.count).toBe(1);
    expect(testing?.count).toBe(1);
  });

  it('orders results by count desc then alphabetical', () => {
    service.create({
      type: 'note',
      title: 'A',
      body: '# A',
      scopes: ['work.projects'],
      tags: ['rare-tag'],
    });
    service.create({
      type: 'note',
      title: 'B',
      body: '# B',
      scopes: ['work.projects'],
      tags: ['popular-tag', 'beta-tag'],
    });
    service.create({
      type: 'note',
      title: 'C',
      body: '# C',
      scopes: ['work.projects'],
      tags: ['popular-tag', 'beta-tag'],
    });

    const tags = listTags(db);
    expect(tags[0]?.tag).toBe('beta-tag');
    expect(tags[1]?.tag).toBe('popular-tag');
    expect(tags[2]?.tag).toBe('rare-tag');
  });

  it('filters by prefix (case-insensitive)', () => {
    service.create({
      type: 'note',
      title: 'A',
      body: '# A',
      scopes: ['work.projects'],
      tags: ['react', 'react-router', 'typescript'],
    });

    const tags = listTags(db, 'react');
    expect(tags.map((t) => t.tag).toSorted()).toEqual(['react', 'react-router']);
  });

  it('respects the limit parameter', () => {
    service.create({
      type: 'note',
      title: 'A',
      body: '# A',
      scopes: ['work.projects'],
      tags: ['a-tag', 'b-tag', 'c-tag', 'd-tag', 'e-tag'],
    });

    expect(listTags(db, undefined, 3)).toHaveLength(3);
  });
});
