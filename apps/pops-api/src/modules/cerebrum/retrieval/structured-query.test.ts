import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../../../shared/test-utils.js';
import { StructuredQueryService } from './structured-query.js';

import type { Database } from 'better-sqlite3';

function seedEngram(
  db: Database,
  opts: {
    id: string;
    title?: string;
    type?: string;
    status?: string;
    created_at?: string;
    modified_at?: string;
    content_hash?: string;
    scopes?: string[];
    tags?: string[];
    preview?: string;
  }
): void {
  db.prepare(
    `INSERT INTO engram_index (id, file_path, type, source, status, created_at, modified_at, title, content_hash, word_count)
     VALUES (@id, @file_path, @type, @source, @status, @created_at, @modified_at, @title, @content_hash, @word_count)`
  ).run({
    id: opts.id,
    file_path: `note/${opts.id}.md`,
    type: opts.type ?? 'note',
    source: 'manual',
    status: opts.status ?? 'active',
    created_at: opts.created_at ?? '2026-01-01T00:00:00Z',
    modified_at: opts.modified_at ?? '2026-01-01T00:00:00Z',
    title: opts.title ?? `Engram ${opts.id}`,
    content_hash: opts.content_hash ?? `hash_${opts.id}`,
    word_count: 10,
  });

  for (const scope of opts.scopes ?? []) {
    db.prepare(`INSERT INTO engram_scopes (engram_id, scope) VALUES (?, ?)`).run(opts.id, scope);
  }

  for (const tag of opts.tags ?? []) {
    db.prepare(`INSERT INTO engram_tags (engram_id, tag) VALUES (?, ?)`).run(opts.id, tag);
  }

  if (opts.preview) {
    db.prepare(
      `INSERT INTO embeddings (source_type, source_id, chunk_index, content_preview, content_hash)
       VALUES ('engram', ?, 0, ?, ?)`
    ).run(opts.id, opts.preview, opts.content_hash ?? `hash_${opts.id}`);
  }
}

describe('StructuredQueryService', () => {
  let db: Database;
  let svc: StructuredQueryService;

  beforeEach(() => {
    db = createTestDb();
    svc = new StructuredQueryService(drizzle(db));
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty array when sourceTypes excludes engram', () => {
    seedEngram(db, { id: 'e1' });
    expect(svc.query({ sourceTypes: ['movie'] })).toHaveLength(0);
  });

  it('returns all active engrams with no filters', () => {
    seedEngram(db, { id: 'e1' });
    seedEngram(db, { id: 'e2' });
    expect(svc.query({})).toHaveLength(2);
  });

  it('excludes orphaned engrams by default', () => {
    seedEngram(db, { id: 'e1', status: 'active' });
    seedEngram(db, { id: 'e2', status: 'orphaned' });
    const ids = svc.query({}).map((r) => r.sourceId);
    expect(ids).toContain('e1');
    expect(ids).not.toContain('e2');
  });

  it('includes only the requested status when status filter is set', () => {
    seedEngram(db, { id: 'e1', status: 'active' });
    seedEngram(db, { id: 'e2', status: 'archived' });
    seedEngram(db, { id: 'e3', status: 'orphaned' });
    const ids = svc.query({ status: ['archived'] }).map((r) => r.sourceId);
    expect(ids).toEqual(['e2']);
  });

  it('filters by type', () => {
    seedEngram(db, { id: 'e1', type: 'note' });
    seedEngram(db, { id: 'e2', type: 'project' });
    const ids = svc.query({ types: ['note'] }).map((r) => r.sourceId);
    expect(ids).toEqual(['e1']);
  });

  it('filters by scope with prefix matching', () => {
    seedEngram(db, { id: 'e1', scopes: ['personal.notes'] });
    seedEngram(db, { id: 'e2', scopes: ['work.projects'] });
    const ids = svc.query({ scopes: ['personal'] }).map((r) => r.sourceId);
    expect(ids).toEqual(['e1']);
  });

  it('matches exact scope when no children exist', () => {
    seedEngram(db, { id: 'e1', scopes: ['personal'] });
    seedEngram(db, { id: 'e2', scopes: ['work'] });
    const ids = svc.query({ scopes: ['personal'] }).map((r) => r.sourceId);
    expect(ids).toEqual(['e1']);
  });

  it('excludes secret-scoped engrams by default', () => {
    seedEngram(db, { id: 'e1', scopes: ['personal'] });
    seedEngram(db, { id: 'e2', scopes: ['personal.secret'] });
    seedEngram(db, { id: 'e3', scopes: ['secret.notes'] });
    const ids = svc.query({}).map((r) => r.sourceId);
    expect(ids).toContain('e1');
    expect(ids).not.toContain('e2');
    expect(ids).not.toContain('e3');
  });

  it('includes secret-scoped engrams when includeSecret is true', () => {
    seedEngram(db, { id: 'e1', scopes: ['personal'] });
    seedEngram(db, { id: 'e2', scopes: ['personal.secret'] });
    expect(svc.query({ includeSecret: true })).toHaveLength(2);
  });

  it('applies tag AND semantics — all tags must be present', () => {
    seedEngram(db, { id: 'e1', tags: ['alpha', 'beta'] });
    seedEngram(db, { id: 'e2', tags: ['alpha'] });
    seedEngram(db, { id: 'e3', tags: ['beta'] });
    const ids = svc.query({ tags: ['alpha', 'beta'] }).map((r) => r.sourceId);
    expect(ids).toEqual(['e1']);
  });

  it('filters by date range (from)', () => {
    seedEngram(db, { id: 'e1', created_at: '2026-03-01T00:00:00Z' });
    seedEngram(db, { id: 'e2', created_at: '2026-01-01T00:00:00Z' });
    const ids = svc.query({ dateRange: { from: '2026-02-01T00:00:00Z' } }).map((r) => r.sourceId);
    expect(ids).toContain('e1');
    expect(ids).not.toContain('e2');
  });

  it('filters by date range (to)', () => {
    seedEngram(db, { id: 'e1', created_at: '2026-01-01T00:00:00Z' });
    seedEngram(db, { id: 'e2', created_at: '2026-03-01T00:00:00Z' });
    const ids = svc.query({ dateRange: { to: '2026-02-01T00:00:00Z' } }).map((r) => r.sourceId);
    expect(ids).toContain('e1');
    expect(ids).not.toContain('e2');
  });

  it('paginates with limit and offset ordered by modified_at desc', () => {
    seedEngram(db, { id: 'e1', modified_at: '2026-01-03T00:00:00Z' });
    seedEngram(db, { id: 'e2', modified_at: '2026-01-02T00:00:00Z' });
    seedEngram(db, { id: 'e3', modified_at: '2026-01-01T00:00:00Z' });
    const page1 = svc.query({}, 2, 0).map((r) => r.sourceId);
    const page2 = svc.query({}, 2, 2).map((r) => r.sourceId);
    expect(page1).toEqual(['e1', 'e2']);
    expect(page2).toEqual(['e3']);
  });

  it('populates scopes and tags in result metadata', () => {
    seedEngram(db, { id: 'e1', scopes: ['home', 'home.living'], tags: ['important', 'todo'] });
    const [result] = svc.query({});
    expect(result?.metadata['scopes']).toEqual(expect.arrayContaining(['home', 'home.living']));
    expect(result?.metadata['tags']).toEqual(expect.arrayContaining(['important', 'todo']));
  });

  it('populates contentPreview from embeddings when available', () => {
    seedEngram(db, { id: 'e1', preview: 'This is the preview text.' });
    const [result] = svc.query({});
    expect(result?.contentPreview).toBe('This is the preview text.');
  });

  it('falls back to empty contentPreview when no embedding row', () => {
    seedEngram(db, { id: 'e1' }); // no preview seeded
    const [result] = svc.query({});
    expect(result?.contentPreview).toBe('');
  });

  it('all results have matchType structured and score 1', () => {
    seedEngram(db, { id: 'e1' });
    const [result] = svc.query({});
    expect(result?.matchType).toBe('structured');
    expect(result?.score).toBe(1);
    expect(result?.sourceType).toBe('engram');
  });
});
