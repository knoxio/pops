/**
 * Integration tests for `cerebrum.engrams.*`, `cerebrum.scopes.*`, and
 * `cerebrum.tags.*` over REST.
 *
 * Boots the app against a per-test temp cerebrum.db and a per-test temp engram
 * root (mkdtemp) so the full create → get → update → delete lifecycle exercises
 * real file IO against the SQLite index. The supertest agent reuses one socket
 * so express-5 doesn't churn ECONNRESETs.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { makeClient, makeEmptyPeerClients, makeTemplateRegistry } from './test-utils.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-engrams-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-engrams-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      engramRoot,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
    })
  );
}

describe('POST /engrams (create)', () => {
  it('creates an engram, writes the file, and indexes it', async () => {
    const { engram } = await client().engrams.create({
      type: 'note',
      title: 'Hello World',
      body: '# Hello World\n\nbody text',
      scopes: ['work.projects.alpha'],
      tags: ['greeting'],
    });
    expect(engram.id).toMatch(/^eng_\d{8}_\d{4}_hello-world$/);
    expect(engram.type).toBe('note');
    expect(engram.scopes).toEqual(['work.projects.alpha']);
    expect(engram.tags).toEqual(['greeting']);
    expect(engram.status).toBe('active');
    expect(engram.source).toBe('manual');

    const fileContent = readFileSync(join(engramRoot, engram.filePath), 'utf8');
    expect(fileContent).toContain('id: eng_');
    expect(fileContent).toContain('body text');
  });

  it('400s when neither scopes nor a template is supplied', async () => {
    await expect(
      client().engrams.create({ type: 'note', title: 'No scope' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s on an invalid source channel', async () => {
    await expect(
      client().engrams.create({
        type: 'note',
        title: 'Bad source',
        scopes: ['work.projects.alpha'],
        source: 'not-a-channel',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('scaffolds a body from a template and merges its default scopes', async () => {
    const { engram } = await client().engrams.create({
      type: 'decision',
      title: 'Pick a database',
      template: 'decision',
      scopes: ['work.projects.alpha'],
      customFields: { decision: 'sqlite', alternatives: ['postgres'] },
    });
    expect(engram.template).toBe('decision');
    const { body } = await client().engrams.get(engram.id);
    expect(body).toContain('Pick a database');
  });
});

describe('GET /engrams/:id', () => {
  it('404s on an unknown engram', async () => {
    await expect(client().engrams.get('eng_20260101_0000_missing')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('returns the engram and its body', async () => {
    const { engram } = await client().engrams.create({
      type: 'note',
      title: 'Readable',
      body: '# Readable\n\nthe body',
      scopes: ['personal.notes.x'],
    });
    const got = await client().engrams.get(engram.id);
    expect(got.engram.id).toBe(engram.id);
    expect(got.body).toContain('the body');
  });
});

describe('PATCH /engrams/:id (update)', () => {
  it('updates title + tags and re-indexes', async () => {
    const { engram } = await client().engrams.create({
      type: 'note',
      title: 'Original',
      body: '# Original\n\ntext',
      scopes: ['work.projects.alpha'],
    });
    const updated = await client().engrams.update(engram.id, {
      title: 'Renamed',
      tags: ['urgent'],
    });
    expect(updated.engram.title).toBe('Renamed');
    expect(updated.engram.tags).toEqual(['urgent']);
  });

  it('400s on an illegal status transition', async () => {
    const { engram } = await client().engrams.create({
      type: 'note',
      title: 'Status test',
      body: 'x',
      scopes: ['work.projects.alpha'],
    });
    await client().engrams.update(engram.id, { status: 'consolidated' });
    await expect(client().engrams.update(engram.id, { status: 'archived' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('DELETE /engrams/:id (archive)', () => {
  it('archives the engram and reports success', async () => {
    const { engram } = await client().engrams.create({
      type: 'note',
      title: 'To archive',
      body: 'x',
      scopes: ['work.projects.alpha'],
    });
    const res = await client().engrams.delete(engram.id);
    expect(res.success).toBe(true);
    const got = await client().engrams.get(engram.id);
    expect(got.engram.status).toBe('archived');
  });

  it('404s archiving an unknown engram', async () => {
    await expect(client().engrams.delete('eng_20260101_0000_nope')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('POST /engrams/search (list)', () => {
  it('filters by scope and returns a total', async () => {
    const c = client();
    await c.engrams.create({
      type: 'note',
      title: 'Alpha',
      body: '# Alpha\n\na',
      scopes: ['work.projects.alpha'],
    });
    await c.engrams.create({
      type: 'note',
      title: 'Beta',
      body: '# Beta\n\nb',
      scopes: ['work.projects.beta'],
    });
    const all = await c.engrams.search({});
    expect(all.total).toBe(2);
    const alpha = await c.engrams.search({ scopes: ['work.projects.alpha'] });
    expect(alpha.engrams).toHaveLength(1);
    expect(alpha.engrams[0]?.title).toBe('Alpha');
  });
});

describe('engram links', () => {
  it('links and unlinks two engrams bidirectionally', async () => {
    const c = client();
    const a = await c.engrams.create({
      type: 'note',
      title: 'A',
      body: 'a',
      scopes: ['work.projects.alpha'],
    });
    const b = await c.engrams.create({
      type: 'note',
      title: 'B',
      body: 'b',
      scopes: ['work.projects.alpha'],
    });
    await c.engrams.link(a.engram.id, b.engram.id);
    const linkedA = await c.engrams.get(a.engram.id);
    const linkedB = await c.engrams.get(b.engram.id);
    expect(linkedA.engram.links).toContain(b.engram.id);
    expect(linkedB.engram.links).toContain(a.engram.id);

    await c.engrams.unlink(a.engram.id, b.engram.id);
    const unlinkedA = await c.engrams.get(a.engram.id);
    expect(unlinkedA.engram.links).not.toContain(b.engram.id);
  });

  it('400s linking an engram to itself', async () => {
    const a = await client().engrams.create({
      type: 'note',
      title: 'Self',
      body: 's',
      scopes: ['work.projects.alpha'],
    });
    await expect(client().engrams.link(a.engram.id, a.engram.id)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('404s linking when the source is missing', async () => {
    const b = await client().engrams.create({
      type: 'note',
      title: 'Target',
      body: 't',
      scopes: ['work.projects.alpha'],
    });
    await expect(
      client().engrams.link('eng_20260101_0000_ghost', b.engram.id)
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('scopes', () => {
  async function seedAlpha() {
    return (
      await client().engrams.create({
        type: 'note',
        title: 'Scoped',
        body: 's',
        scopes: ['work.projects.alpha'],
      })
    ).engram;
  }

  it('assigns and removes scopes', async () => {
    const c = client();
    const engram = await seedAlpha();
    const assigned = await c.scopes.assign(engram.id, ['work.projects.beta']);
    expect(assigned.engram.scopes).toEqual(
      expect.arrayContaining(['work.projects.alpha', 'work.projects.beta'])
    );
    const removed = await c.scopes.remove(engram.id, ['work.projects.alpha']);
    expect(removed.engram.scopes).toEqual(['work.projects.beta']);
  });

  it('400s removing the last scope', async () => {
    const c = client();
    const engram = await seedAlpha();
    await expect(c.scopes.remove(engram.id, ['work.projects.alpha'])).rejects.toMatchObject({
      status: 400,
    });
  });

  it('400s on a malformed scope', async () => {
    const c = client();
    const engram = await seedAlpha();
    await expect(c.scopes.assign(engram.id, ['Bad Scope!'])).rejects.toMatchObject({
      status: 400,
    });
  });

  it('lists scopes with counts and filters by prefix', async () => {
    const c = client();
    await seedAlpha();
    const all = await c.scopes.list();
    expect(all.scopes).toEqual([{ scope: 'work.projects.alpha', count: 1 }]);
    const filtered = await c.scopes.list('work');
    expect(filtered.scopes).toHaveLength(1);
    const none = await c.scopes.list('personal');
    expect(none.scopes).toEqual([]);
  });

  it('validates scope strings', async () => {
    const c = client();
    const ok = await c.scopes.validate('work.projects.alpha');
    expect(ok.valid).toBe(true);
    expect(ok.scope).toBe('work.projects.alpha');
    const bad = await c.scopes.validate('x');
    expect(bad.valid).toBe(false);
    expect(bad.errors?.length).toBeGreaterThan(0);
  });

  it('reclassifies a scope prefix across matching engrams', async () => {
    const c = client();
    const engram = await seedAlpha();
    const dry = await c.scopes.reclassify('work.projects', 'work.archived', true);
    expect(dry.count).toBe(1);
    expect(dry.ids).toContain(engram.id);

    const applied = await c.scopes.reclassify('work.projects', 'work.archived');
    expect(applied.count).toBe(1);
    const got = await c.engrams.get(engram.id);
    expect(got.engram.scopes).toEqual(['work.archived.alpha']);
  });

  it('reconciles a typo against the known vocabulary', async () => {
    const c = client();
    await seedAlpha();
    const { reconciled } = await c.scopes.reconcile(['work.projects.alpah']);
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]?.canonical).toBe('work.projects.alpha');
  });

  it('filters engrams by scope, excluding secret scopes by default', async () => {
    const c = client();
    const open = await seedAlpha();
    const secret = await c.engrams.create({
      type: 'note',
      title: 'Secret',
      body: 'shh',
      scopes: ['personal.secret.diary'],
    });
    const visible = await c.scopes.filter([]);
    expect(visible.engrams.map((e) => e.id)).toContain(open.id);
    expect(visible.engrams.map((e) => e.id)).not.toContain(secret.engram.id);

    const withSecret = await c.scopes.filter([], true);
    expect(withSecret.engrams.map((e) => e.id)).toContain(secret.engram.id);
  });
});

describe('tags', () => {
  it('lists tags ranked by usage count', async () => {
    const c = client();
    await c.engrams.create({
      type: 'note',
      title: 'One',
      body: '1',
      scopes: ['work.projects.alpha'],
      tags: ['common', 'rare'],
    });
    await c.engrams.create({
      type: 'note',
      title: 'Two',
      body: '2',
      scopes: ['work.projects.alpha'],
      tags: ['common'],
    });
    const { tags } = await c.tags.list();
    expect(tags[0]).toEqual({ tag: 'common', count: 2 });
    expect(tags.map((t) => t.tag)).toContain('rare');

    const filtered = await c.tags.list('com');
    expect(filtered.tags).toEqual([{ tag: 'common', count: 2 }]);
  });
});
