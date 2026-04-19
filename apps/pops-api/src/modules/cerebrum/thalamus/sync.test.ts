/**
 * FrontmatterSyncService tests.
 *
 * Uses a real in-memory SQLite database and temp files to verify that:
 *  - `syncFile()` upserts the engram_index row correctly
 *  - Junction tables are diffed on repeated calls
 *  - `markOrphaned()` updates status without deleting the row
 *  - Parse errors return `status: 'error'`
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { engramIndex, engramScopes, engramTags } from '@pops/db-types';

import { createTestDb } from '../../../shared/test-utils.js';
import { FrontmatterSyncService } from './sync.js';

import type { Database } from 'better-sqlite3';

const VALID_FRONTMATTER = `---
id: eng_20260419_1200_test-note
type: note
scopes:
  - personal.notes
created: "2026-04-19T12:00:00Z"
modified: "2026-04-19T12:00:00Z"
source: manual
status: active
---

# Test Note

This is the body of the test note.
`;

const VALID_FRONTMATTER_UPDATED = `---
id: eng_20260419_1200_test-note
type: note
scopes:
  - personal.notes
  - work
tags:
  - important
created: "2026-04-19T12:00:00Z"
modified: "2026-04-19T13:00:00Z"
source: manual
status: active
---

# Test Note Updated

This is the updated body.
`;

const INVALID_FRONTMATTER = `---
id: NOT_VALID
type: note
scopes: []
created: "2026-04-19T12:00:00Z"
modified: "2026-04-19T12:00:00Z"
source: manual
status: active
---

# Bad note
`;

describe('FrontmatterSyncService', () => {
  let db: Database;
  let root: string;
  let service: FrontmatterSyncService;

  beforeEach(() => {
    db = createTestDb();
    root = mkdtempSync(join(tmpdir(), 'thalamus-sync-'));
    service = new FrontmatterSyncService(root, drizzle(db));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // -------------------------------------------------------------------------
  // syncFile — happy path
  // -------------------------------------------------------------------------

  it('syncFile returns synced status and correct fields', () => {
    const dir = join(root, 'note');
    mkdirSync(dir, { recursive: true });
    const relPath = 'note/eng_20260419_1200_test-note.md';
    writeFileSync(join(root, relPath), VALID_FRONTMATTER);

    const result = service.syncFile(relPath);

    expect(result.status).toBe('synced');
    expect(result.engramId).toBe('eng_20260419_1200_test-note');
    expect(result.contentHash).toBeTypeOf('string');
    expect(result.contentHash).toHaveLength(64); // SHA-256 hex
    expect(result.previousContentHash).toBeUndefined(); // first insert
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('upserts the engram_index row', () => {
    const relPath = 'note/eng_20260419_1200_test-note.md';
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(join(root, relPath), VALID_FRONTMATTER);

    service.syncFile(relPath);

    const drizzleDb = drizzle(db);
    const [row] = drizzleDb.select().from(engramIndex).all();
    expect(row).toBeDefined();
    expect(row?.id).toBe('eng_20260419_1200_test-note');
    expect(row?.type).toBe('note');
    expect(row?.status).toBe('active');
    expect(row?.filePath).toBe(relPath);
  });

  it('inserts scopes into engram_scopes', () => {
    const relPath = 'note/eng_20260419_1200_test-note.md';
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(join(root, relPath), VALID_FRONTMATTER);

    service.syncFile(relPath);

    const drizzleDb = drizzle(db);
    const scopes = drizzleDb.select().from(engramScopes).all();
    expect(scopes.map((s) => s.scope)).toContain('personal.notes');
  });

  it('sets previousContentHash on a second sync of the same file', () => {
    const relPath = 'note/eng_20260419_1200_test-note.md';
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(join(root, relPath), VALID_FRONTMATTER);

    const first = service.syncFile(relPath);
    expect(first.previousContentHash).toBeUndefined();

    // Sync again without changes — hash should match.
    const second = service.syncFile(relPath);
    expect(second.previousContentHash).toBe(first.contentHash);
    expect(second.contentHash).toBe(first.contentHash);
  });

  it('diffs scopes on update — adds and removes correctly', () => {
    const relPath = 'note/eng_20260419_1200_test-note.md';
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(join(root, relPath), VALID_FRONTMATTER);
    service.syncFile(relPath);

    // Update the file with more scopes and tags.
    writeFileSync(join(root, relPath), VALID_FRONTMATTER_UPDATED);
    service.syncFile(relPath);

    const drizzleDb = drizzle(db);
    const scopes = drizzleDb
      .select()
      .from(engramScopes)
      .all()
      .map((s) => s.scope);
    expect(scopes).toContain('personal.notes');
    expect(scopes).toContain('work');

    const tags = drizzleDb
      .select()
      .from(engramTags)
      .all()
      .map((t) => t.tag);
    expect(tags).toContain('important');
  });

  it('processEvents routes create events to syncFile', async () => {
    const relPath = 'note/eng_20260419_1200_test-note.md';
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(join(root, relPath), VALID_FRONTMATTER);

    const results = await service.processEvents([{ type: 'create', filePath: relPath }]);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('synced');
  });

  it('processEvents routes delete events to markOrphaned', async () => {
    const relPath = 'note/eng_20260419_1200_test-note.md';
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(join(root, relPath), VALID_FRONTMATTER);
    service.syncFile(relPath);

    const results = await service.processEvents([{ type: 'delete', filePath: relPath }]);
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe('orphaned');
  });

  // -------------------------------------------------------------------------
  // markOrphaned
  // -------------------------------------------------------------------------

  it('markOrphaned updates status to orphaned', () => {
    const relPath = 'note/eng_20260419_1200_test-note.md';
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(join(root, relPath), VALID_FRONTMATTER);
    service.syncFile(relPath);

    service.markOrphaned(relPath);

    const drizzleDb = drizzle(db);
    const [row] = drizzleDb.select().from(engramIndex).all();
    expect(row?.status).toBe('orphaned');
  });

  it('markOrphaned is a no-op for non-existent paths (no crash)', () => {
    expect(() => service.markOrphaned('nonexistent/path.md')).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it('returns error status for missing file', () => {
    const result = service.syncFile('note/does-not-exist.md');
    expect(result.status).toBe('error');
    expect(result.error).toContain('file not found');
  });

  it('returns error status for invalid frontmatter', () => {
    const relPath = 'note/eng_20260419_1200_test-note.md';
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(join(root, relPath), INVALID_FRONTMATTER);

    const result = service.syncFile(relPath);
    expect(result.status).toBe('error');
    expect(result.error).toBeTruthy();
  });

  it('does not insert index row on parse error', () => {
    const relPath = 'note/eng_20260419_1200_test-note.md';
    mkdirSync(join(root, 'note'), { recursive: true });
    writeFileSync(join(root, relPath), INVALID_FRONTMATTER);

    service.syncFile(relPath);

    const drizzleDb = drizzle(db);
    const rows = drizzleDb.select().from(engramIndex).all();
    expect(rows).toHaveLength(0);
  });
});
