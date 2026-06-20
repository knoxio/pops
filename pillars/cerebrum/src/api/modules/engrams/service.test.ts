/**
 * Unit tests for the {@link EngramService} paths NOT exposed on the REST
 * surface (restore, hardDelete, changeType, reindex, exists) plus the
 * create/update/archive happy path. Exercises real file IO against a temp
 * engram root and a temp cerebrum.db opened through `openCerebrumDb` so the
 * SQLite index and the on-disk Markdown stay in lock-step.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../../db/index.js';
import { TemplateRegistry } from '../templates/registry.js';
import { parseEngramFile } from './file.js';
import { EngramService } from './service.js';

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'defaults');

function makeClock(start = new Date('2026-04-18T09:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
}

describe('EngramService', () => {
  let opened: OpenedCerebrumDb;
  let service: EngramService;
  let dbDir: string;
  let root: string;

  beforeEach(() => {
    dbDir = mkdtempSync(join(tmpdir(), 'cerebrum-svc-db-'));
    root = mkdtempSync(join(tmpdir(), 'cerebrum-svc-root-'));
    opened = openCerebrumDb(join(dbDir, 'cerebrum.db'), { loadVec: false });
    service = new EngramService({
      root,
      db: opened.db,
      templates: new TemplateRegistry(TEMPLATES_DIR),
      now: makeClock(),
    });
  });

  afterEach(() => {
    opened.raw.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
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
    expect(existsSync(join(root, engram.filePath))).toBe(true);
    expect(service.exists(engram.id)).toBe(true);
  });

  it('archive then restore round-trips the file out of and back into .archive/', () => {
    const created = service.create({
      type: 'note',
      title: 'Round trip',
      body: '# Round trip\n\nbody',
      scopes: ['personal.notes'],
    });
    const archived = service.archive(created.id);
    expect(archived.status).toBe('archived');
    expect(archived.filePath.startsWith('.archive/')).toBe(true);
    expect(existsSync(join(root, '.archive', `note/${created.id}.md`))).toBe(true);

    const { engram, result } = service.restore(created.id);
    expect(result.moved).toBe(true);
    expect(engram.status).toBe('active');
    expect(engram.filePath).toBe(`note/${created.id}.md`);
    expect(existsSync(join(root, '.archive', `note/${created.id}.md`))).toBe(false);
  });

  it('changeType moves the file and preserves the id', () => {
    const created = service.create({
      type: 'capture',
      title: 'Quick',
      body: '# Quick\n\njot',
      scopes: ['personal.captures'],
    });
    const changed = service.changeType(created.id, 'idea');
    expect(changed.id).toBe(created.id);
    expect(changed.type).toBe('idea');
    expect(existsSync(join(root, `idea/${created.id}.md`))).toBe(true);
    expect(existsSync(join(root, `capture/${created.id}.md`))).toBe(false);
  });

  it('hardDelete removes the file, index row, and strips inbound links', () => {
    const a = service.create({
      type: 'note',
      title: 'A',
      body: '# A',
      scopes: ['personal.notes'],
    });
    const b = service.create({
      type: 'note',
      title: 'B',
      body: '# B',
      scopes: ['personal.notes'],
    });
    service.link(a.id, b.id);

    const result = service.hardDelete(b.id);
    expect(result.fileRemoved).toBe(true);
    expect(result.indexRemoved).toBe(true);
    expect(result.inboundLinkSourcesRewritten).toContain(a.id);
    expect(service.exists(b.id)).toBe(false);

    const reread = parseEngramFile(readFileSync(join(root, a.filePath), 'utf8'));
    expect(reread.frontmatter.links ?? []).not.toContain(b.id);
  });

  it('reindex rebuilds the SQLite index from the files on disk', () => {
    const created = service.create({
      type: 'note',
      title: 'Indexed',
      body: '# Indexed\n\nbody',
      scopes: ['personal.notes'],
    });
    // Drop the index row out-of-band, leaving the file as the source of truth.
    opened.raw.prepare('DELETE FROM engram_index').run();
    expect(service.exists(created.id)).toBe(false);

    const { indexed } = service.reindex();
    expect(indexed).toBe(1);
    expect(service.exists(created.id)).toBe(true);
  });

  it('throws NotFoundError reading an engram whose file was deleted out-of-band', () => {
    const created = service.create({
      type: 'note',
      title: 'Gone',
      body: '# Gone',
      scopes: ['personal.notes'],
    });
    rmSync(join(root, created.filePath));
    expect(() => service.read(created.id)).toThrow();
  });

  it('preserves a hand-written file on reindex (custom fields survive)', () => {
    const dir = join(root, 'note');
    mkdirSync(dir, { recursive: true });
    const id = 'eng_20260418_0900_handwritten';
    writeFileSync(
      join(dir, `${id}.md`),
      [
        '---',
        `id: ${id}`,
        'type: note',
        'scopes:',
        '  - personal.notes',
        "created: '2026-04-18T09:00:00Z'",
        "modified: '2026-04-18T09:00:00Z'",
        'source: manual',
        'status: active',
        'priority: high',
        '---',
        '# Handwritten',
        '',
        'body',
        '',
      ].join('\n'),
      'utf8'
    );
    const { indexed } = service.reindex();
    expect(indexed).toBe(1);
    const { engram } = service.read(id);
    expect(engram.customFields['priority']).toBe('high');
  });
});
