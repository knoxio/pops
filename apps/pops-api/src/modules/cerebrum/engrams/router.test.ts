import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, setDb } from '../../../db.js';
import { appRouter } from '../../../router.js';
import { createTestDb } from '../../../shared/test-utils.js';
import { resetCerebrumCache } from '../instance.js';

import type { Database } from 'better-sqlite3';

function createCaller() {
  return appRouter.createCaller({ user: { email: 'test@example.com' } });
}

describe('cerebrum tRPC router', () => {
  let db: Database;
  let root: string;
  let previousRoot: string | undefined;

  beforeEach(() => {
    db = createTestDb();
    setDb(db);
    root = mkdtempSync(join(tmpdir(), 'cerebrum-router-'));
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

  it('cerebrum.engrams.create + get + list round-trip', async () => {
    const caller = createCaller();
    const { engram } = await caller.cerebrum.engrams.create({
      type: 'note',
      title: 'Router Hello',
      body: '# Router Hello\n\nHi.',
      scopes: ['personal.notes'],
    });
    expect(engram.title).toBe('Router Hello');

    const fetched = await caller.cerebrum.engrams.get({ id: engram.id });
    expect(fetched.engram.id).toBe(engram.id);
    expect(fetched.body).toContain('Hi.');

    const listed = await caller.cerebrum.engrams.list({ type: 'note' });
    expect(listed.total).toBe(1);
    expect(listed.engrams[0]?.id).toBe(engram.id);
  });

  it('templates.list returns the bundled defaults', async () => {
    const caller = createCaller();
    const { templates } = await caller.cerebrum.templates.list();
    const names = templates.map((t) => t.name).toSorted();
    expect(names).toEqual([
      'capture',
      'decision',
      'idea',
      'journal',
      'meeting',
      'note',
      'research',
    ]);
  });

  it('templates.get returns a single template or NOT_FOUND', async () => {
    const caller = createCaller();
    const { template } = await caller.cerebrum.templates.get({ name: 'decision' });
    expect(template.required_fields).toEqual(['decision', 'alternatives']);

    await expect(caller.cerebrum.templates.get({ name: 'missing' })).rejects.toThrow(/not found/i);
  });

  it('surfaces the specific reason from a ValidationError (not generic "Validation failed")', async () => {
    const caller = createCaller();
    await expect(
      caller.cerebrum.engrams.create({
        type: 'decision',
        title: 'Missing fields',
        scopes: ['work'],
        template: 'decision',
      })
    ).rejects.toThrow(/decision/i);
  });

  it('delete archives instead of physically deleting', async () => {
    const caller = createCaller();
    const { engram } = await caller.cerebrum.engrams.create({
      type: 'note',
      title: 'To delete',
      body: '# x',
      scopes: ['x'],
    });
    await caller.cerebrum.engrams.delete({ id: engram.id });

    const fetched = await caller.cerebrum.engrams.get({ id: engram.id });
    expect(fetched.engram.status).toBe('archived');
    expect(fetched.engram.filePath.startsWith('.archive/')).toBe(true);
  });
});
