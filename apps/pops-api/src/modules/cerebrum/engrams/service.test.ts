import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NotFoundError, ValidationError } from '../../../shared/errors.js';
import { createTestDb } from '../../../shared/test-utils.js';
import { TemplateRegistry } from '../templates/registry.js';
import { seedDefaultTemplates } from '../templates/seed.js';
import { parseEngramFile } from './file.js';
import { EngramService } from './service.js';

import type { Database } from 'better-sqlite3';

/** A fixed clock that advances one minute per call. */
function makeClock(start = new Date('2026-04-18T09:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
}

describe('EngramService', () => {
  let db: Database;
  let service: EngramService;
  let root: string;

  beforeEach(() => {
    db = createTestDb();
    root = mkdtempSync(join(tmpdir(), 'cerebrum-engrams-'));
    const templatesDir = join(root, '.templates');
    seedDefaultTemplates(templatesDir);
    service = new EngramService({
      root,
      db: drizzle(db),
      templates: new TemplateRegistry(templatesDir),
      now: makeClock(),
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('creates an engram file and index row', () => {
    const engram = service.create({
      type: 'note',
      title: 'Hello World',
      body: '# Hello World\n\nThe body.',
      scopes: ['personal.notes'],
    });

    expect(engram.id).toMatch(/^eng_\d{8}_\d{4}_hello-world$/);
    expect(engram.filePath).toBe(`note/${engram.id}.md`);
    expect(engram.wordCount).toBeGreaterThan(0);
    expect(existsSync(join(root, engram.filePath))).toBe(true);

    const content = readFileSync(join(root, engram.filePath), 'utf8');
    const { frontmatter, body } = parseEngramFile(content);
    expect(frontmatter.id).toBe(engram.id);
    expect(frontmatter.scopes).toEqual(['personal.notes']);
    expect(body.trim()).toContain('The body.');
  });

  it('rejects create without scopes when no template is applied', () => {
    expect(() => service.create({ type: 'note', title: 'No scope', body: 'x' })).toThrow(
      ValidationError
    );
  });

  it('uses a template to scaffold, merge scopes, and validate required fields', () => {
    const engram = service.create({
      type: 'decision',
      title: 'Pick runtime',
      scopes: ['work'],
      template: 'decision',
      customFields: { decision: 'Node', alternatives: ['Bun', 'Deno'] },
    });
    expect(engram.template).toBe('decision');
    expect(engram.scopes).toEqual(['work']);
    expect(engram.customFields['decision']).toBe('Node');
    const fileContent = readFileSync(join(root, engram.filePath), 'utf8');
    expect(fileContent).toContain('## Decision');
    expect(fileContent).toContain('Node');
  });

  it('falls back to capture-style when the template does not exist (PRD-077 US-02)', () => {
    const engram = service.create({
      type: 'note',
      title: 'Falls back',
      scopes: ['personal'],
      template: 'nonexistent',
    });
    expect(engram.template).toBeNull();
    expect(engram.type).toBe('capture');
    expect(engram.filePath.startsWith('capture/')).toBe(true);
  });

  it('rejects unsafe type values that could escape the engram root', () => {
    expect(() =>
      service.create({ type: '../etc', title: 'bad', body: '# x', scopes: ['x'] })
    ).toThrow(ValidationError);
    expect(() =>
      service.create({ type: '.archive', title: 'bad', body: '# x', scopes: ['x'] })
    ).toThrow(ValidationError);
  });

  it('dedupes duplicate scopes/tags/links from input', () => {
    const engram = service.create({
      type: 'note',
      title: 'Dedupe',
      body: '# Dedupe',
      scopes: ['work', 'work', 'personal'],
      tags: ['a', 'a', 'b'],
    });
    // The hydrator reads junction rows without ordering so compare as sets.
    expect(new Set(engram.scopes)).toEqual(new Set(['work', 'personal']));
    expect(engram.scopes).toHaveLength(2);
    expect(new Set(engram.tags)).toEqual(new Set(['a', 'b']));
    expect(engram.tags).toHaveLength(2);
  });

  it('updates title, body, and scopes and bumps modified', () => {
    const engram = service.create({
      type: 'note',
      title: 'First',
      body: '# First\n\nbody',
      scopes: ['personal'],
    });
    const updated = service.update(engram.id, {
      title: 'Second',
      scopes: ['personal', 'work'],
    });
    expect(updated.title).toBe('Second');
    expect(updated.scopes).toEqual(['personal', 'work']);
    expect(updated.modified).not.toBe(engram.modified);
  });

  it('archives an engram — file moves to .archive/ and status flips', () => {
    const engram = service.create({
      type: 'note',
      title: 'To archive',
      body: '# body',
      scopes: ['personal'],
    });
    const archived = service.archive(engram.id);
    expect(archived.status).toBe('archived');
    expect(archived.filePath.startsWith('.archive/')).toBe(true);
    expect(existsSync(join(root, engram.filePath))).toBe(false);
    expect(existsSync(join(root, archived.filePath))).toBe(true);
  });

  it('links two engrams bidirectionally in both files and the index', () => {
    const a = service.create({ type: 'note', title: 'A', body: '# a', scopes: ['x'] });
    const b = service.create({ type: 'note', title: 'B', body: '# b', scopes: ['x'] });

    service.link(a.id, b.id);

    const reloadA = service.read(a.id).engram;
    const reloadB = service.read(b.id).engram;
    expect(reloadA.links).toContain(b.id);
    expect(reloadB.links).toContain(a.id);
  });

  it('unlink removes links in both directions', () => {
    const a = service.create({ type: 'note', title: 'A', body: '# a', scopes: ['x'] });
    const b = service.create({ type: 'note', title: 'B', body: '# b', scopes: ['x'] });
    service.link(a.id, b.id);
    service.unlink(a.id, b.id);
    expect(service.read(a.id).engram.links).not.toContain(b.id);
    expect(service.read(b.id).engram.links).not.toContain(a.id);
  });

  it('list filters by type, scope, and tag', () => {
    service.create({ type: 'note', title: 'One', body: '# o', scopes: ['work'], tags: ['t1'] });
    service.create({ type: 'note', title: 'Two', body: '# t', scopes: ['personal'], tags: ['t2'] });
    service.create({
      type: 'decision',
      title: 'Three',
      body: '# th',
      scopes: ['work'],
      template: 'decision',
      customFields: { decision: 'ok', alternatives: ['a'] },
    });

    expect(service.list({ type: 'note' }).total).toBe(2);
    expect(service.list({ scopes: ['work'] }).total).toBe(2);
    expect(service.list({ tags: ['t1'] }).total).toBe(1);
    expect(service.list({ type: 'note', tags: ['t2'] }).total).toBe(1);
  });

  it('reindex rebuilds the index from files', () => {
    const a = service.create({ type: 'note', title: 'A', body: '# A', scopes: ['x'] });
    service.create({ type: 'note', title: 'B', body: '# B', scopes: ['x'] });

    // Directly nuke the index to simulate drift.
    db.exec('DELETE FROM engram_index');
    expect(service.list({}).total).toBe(0);

    const result = service.reindex();
    expect(result.indexed).toBe(2);
    expect(service.list({}).total).toBe(2);
    expect(service.read(a.id).engram.title).toBe('A');
  });

  it('read throws NotFound for unknown id', () => {
    expect(() => service.read('eng_20260101_0000_nope')).toThrow(NotFoundError);
  });

  it('link accepts a missing target (creates index row but does not write a target file)', () => {
    const a = service.create({ type: 'note', title: 'A', body: '# a', scopes: ['x'] });
    const ghostId = 'eng_20260101_0000_ghost';
    service.link(a.id, ghostId);
    expect(service.read(a.id).engram.links).toContain(ghostId);
  });
});
