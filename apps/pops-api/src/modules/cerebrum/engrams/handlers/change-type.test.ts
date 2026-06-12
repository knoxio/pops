/**
 * Tests for the engram type-change handler (PRD-081 US-03 AC #6).
 *
 * Verifies that a quick-captured engram graduates from `captures/{id}.md` to
 * `{type}/{id}.md` atomically: the file moves, the index updates to the new
 * `type`/`file_path`, the id is preserved, and existing links still resolve.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ValidationError } from '../../../../shared/errors.js';
import { createTestDb } from '../../../../shared/test-utils.js';
import { TemplateRegistry } from '../../templates/registry.js';
import { seedDefaultTemplates } from '../../templates/seed.js';
import { parseEngramFile } from '../file.js';
import { EngramService } from '../service.js';

import type { Database } from 'better-sqlite3';

function makeClock(start = new Date('2026-04-18T09:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
}

describe('EngramService.changeType (PRD-081 US-03 AC #6)', () => {
  let db: Database;
  let service: EngramService;
  let root: string;

  beforeEach(() => {
    db = createTestDb();
    root = mkdtempSync(join(tmpdir(), 'cerebrum-change-type-'));
    const templatesDir = join(root, '.templates');
    seedDefaultTemplates(templatesDir);
    service = new EngramService({
      root,
      db: drizzle<Record<string, unknown>>(db),
      templates: new TemplateRegistry(templatesDir),
      now: makeClock(),
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('moves the file from capture/ to the new type folder and updates the index', () => {
    const engram = service.create({
      type: 'capture',
      title: 'A thought',
      body: '# A thought\n\nbody',
      scopes: ['personal.captures'],
      source: 'cli',
    });
    const oldPath = engram.filePath;
    expect(oldPath.startsWith('capture/')).toBe(true);

    const moved = service.changeType(engram.id, 'idea');

    expect(moved.id).toBe(engram.id);
    expect(moved.type).toBe('idea');
    expect(moved.filePath).toBe(`idea/${engram.id}.md`);
    expect(existsSync(join(root, oldPath))).toBe(false);
    expect(existsSync(join(root, moved.filePath))).toBe(true);
  });

  it('preserves frontmatter (scopes, tags, source, custom fields) and body content', () => {
    const engram = service.create({
      type: 'capture',
      title: 'A thought',
      body: '# A thought\n\nThe original body.\n',
      scopes: ['personal.captures'],
      tags: ['raw', 'cli'],
      source: 'cli',
    });
    // Stash a custom field via update so we know the change-type carries it.
    service.update(engram.id, { customFields: { _enrichedHash: 'abc123' } });

    const moved = service.changeType(engram.id, 'idea');

    expect(new Set(moved.tags)).toEqual(new Set(['raw', 'cli']));
    expect(moved.scopes).toEqual(['personal.captures']);
    expect(moved.source).toBe('cli');
    expect(moved.customFields['_enrichedHash']).toBe('abc123');

    const content = readFileSync(join(root, moved.filePath), 'utf8');
    const { frontmatter, body } = parseEngramFile(content);
    expect(frontmatter.type).toBe('idea');
    expect(frontmatter.id).toBe(engram.id);
    expect(body).toContain('The original body.');
  });

  it('bumps `modified` but keeps `created`', () => {
    const engram = service.create({
      type: 'capture',
      title: 'A thought',
      body: '# A thought',
      scopes: ['personal.captures'],
    });
    const moved = service.changeType(engram.id, 'idea');
    expect(moved.created).toBe(engram.created);
    expect(moved.modified).not.toBe(engram.modified);
  });

  it('keeps links to the moved engram intact (id-based, not path-based)', () => {
    const capture = service.create({
      type: 'capture',
      title: 'Captured',
      body: '# Captured',
      scopes: ['personal.captures'],
    });
    const ref = service.create({
      type: 'note',
      title: 'Reference',
      body: '# Reference',
      scopes: ['personal'],
    });
    service.link(ref.id, capture.id);

    service.changeType(capture.id, 'idea');

    const reloadRef = service.read(ref.id).engram;
    const reloadCapture = service.read(capture.id).engram;
    expect(reloadRef.links).toContain(capture.id);
    expect(reloadCapture.links).toContain(ref.id);
    expect(reloadCapture.filePath).toBe(`idea/${capture.id}.md`);
  });

  it('is a no-op when the new type equals the current type', () => {
    const engram = service.create({
      type: 'idea',
      title: 'Stays put',
      body: '# Stays put',
      scopes: ['personal.ideas'],
    });
    const before = service.read(engram.id).engram;
    const after = service.changeType(engram.id, 'idea');
    expect(after.filePath).toBe(before.filePath);
    expect(after.modified).toBe(before.modified);
  });

  it('rejects unsafe type values', () => {
    const engram = service.create({
      type: 'capture',
      title: 'Bad target',
      body: '# Bad target',
      scopes: ['personal.captures'],
    });
    expect(() => service.changeType(engram.id, '../etc')).toThrow(ValidationError);
    expect(() => service.changeType(engram.id, '.archive')).toThrow(ValidationError);
  });

  it('refuses to overwrite an existing file at the destination', () => {
    const engram = service.create({
      type: 'capture',
      title: 'Will collide',
      body: '# Will collide',
      scopes: ['personal.captures'],
    });
    // Park a file at the destination path before attempting the move.
    const ideaDir = join(root, 'idea');
    mkdirSync(ideaDir, { recursive: true });
    writeFileSync(join(ideaDir, `${engram.id}.md`), 'occupied', { flag: 'w' });

    expect(() => service.changeType(engram.id, 'idea')).toThrow(ValidationError);

    // Original file still in place; index untouched.
    expect(existsSync(join(root, engram.filePath))).toBe(true);
    expect(service.read(engram.id).engram.type).toBe('capture');
  });

  it('rolls back the new file when the index upsert fails', () => {
    const engram = service.create({
      type: 'capture',
      title: 'Rollback',
      body: '# Rollback',
      scopes: ['personal.captures'],
    });

    // Drop the engram_scopes junction so the upsert inside changeType throws
    // *after* writing the new file (the file write happens before upsertIndex).
    db.exec('DROP TABLE engram_scopes');

    expect(() => service.changeType(engram.id, 'idea')).toThrow();

    expect(existsSync(join(root, `idea/${engram.id}.md`))).toBe(false);
    expect(existsSync(join(root, engram.filePath))).toBe(true);
  });
});
